import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma.js";
import { generateQuotePdf } from "./pdf.service.js";
import { addQuoteItemBySearch, getQuoteById } from "./quote.service.js";
import { searchProduct } from "./product.service.js";
import type { AgentDecision, AgentProductRequest } from "../types/agent.types.js";

type ExecuteAgentActionsInput = {
  decision: AgentDecision;
  quoteId: string;
  conversationId: string;
};

type LastProductContext = {
  productId: string;
  productName: string;
  productUnit?: string | null;
  customerText?: string | null;
  updatedAt: string;
};

function formatDOP(value: unknown) {
  return `RD$${Number(value ?? 0).toLocaleString("es-DO", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

function getConversationMeta(metadata: Prisma.JsonValue | null): Record<string, any> {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return {};
  }

  return metadata as Record<string, any>;
}

async function getLastProductContext(
  conversationId: string
): Promise<LastProductContext | null> {
  const conversation = await prisma.conversation.findUnique({
    where: {
      id: conversationId
    },
    select: {
      metadata: true
    }
  });

  const meta = getConversationMeta(conversation?.metadata ?? null);

  if (!meta.lastProductContext) {
    return null;
  }

  return meta.lastProductContext as LastProductContext;
}

async function saveLastProductContext(input: {
  conversationId: string;
  productId: string;
  productName: string;
  productUnit?: string | null;
  customerText?: string | null;
}) {
  const conversation = await prisma.conversation.findUnique({
    where: {
      id: input.conversationId
    },
    select: {
      metadata: true
    }
  });

  const meta = getConversationMeta(conversation?.metadata ?? null);

  meta.lastProductContext = {
    productId: input.productId,
    productName: input.productName,
    productUnit: input.productUnit ?? null,
    customerText: input.customerText ?? null,
    updatedAt: new Date().toISOString()
  };

  await prisma.conversation.update({
    where: {
      id: input.conversationId
    },
    data: {
      metadata: meta as Prisma.InputJsonValue
    }
  });
}

function looksLikeQuantityOnlyRequest(productRequest: AgentProductRequest) {
  const normalized = productRequest.normalizedText.trim().toLowerCase();
  const original = productRequest.originalText.trim().toLowerCase();

  const quantity = productRequest.quantity || 1;
  const unit = productRequest.unit?.trim();

  if (quantity <= 1 && !unit) {
    return false;
  }

  const weakProductWords = [
    "",
    "galon",
    "galón",
    "galones",
    "unidad",
    "unidades",
    "funda",
    "fundas",
    "caja",
    "cajas",
    "paquete",
    "paquetes"
  ];

  if (weakProductWords.includes(normalized)) {
    return true;
  }

  const textWithoutNumbers = original
    .replace(/[0-9]+/g, "")
    .replace(/\b(agrega|agregame|agrégame|cotiza|cotizame|cotízame|ponme|quiero|necesito|de|del|la|el|los|las|a|mi|cotizacion|cotización)\b/g, "")
    .trim();

  return weakProductWords.includes(textWithoutNumbers);
}

async function addProductRequestToQuote(input: {
  quoteId: string;
  conversationId: string;
  productRequest: AgentProductRequest;
}) {
  const lastProductContext = await getLastProductContext(input.conversationId);

  if (
    lastProductContext &&
    looksLikeQuantityOnlyRequest(input.productRequest)
  ) {
    const result = await addQuoteItemBySearch(input.quoteId, {
      query: lastProductContext.productName,
      quantity: input.productRequest.quantity || 1
    });

    return {
      result,
      displayName: lastProductContext.productName,
      usedContext: true
    };
  }

  const query =
    input.productRequest.normalizedText ||
    input.productRequest.originalText;

  const result = await addQuoteItemBySearch(input.quoteId, {
    query,
    quantity: input.productRequest.quantity || 1
  });

  return {
    result,
    displayName: query,
    usedContext: false
  };
}

export async function executeAgentActions(input: ExecuteAgentActionsInput) {
  const addedProducts: string[] = [];
  const needsConfirmation: string[] = [];
  const notFoundProducts: string[] = [];

  let pdfUrl: string | null = null;
  let pdfPath: string | null = null;
  let pdfFilename: string | null = null;
  let finalReplyText = input.decision.replyText;

  const hasGeneratePdfAction = input.decision.actions.some(
    (action) => action.type === "GENERATE_PDF"
  );

  const shouldAddProducts =
    input.decision.intent === "ADD_TO_QUOTE" ||
    input.decision.actions.some((action) => action.type === "ADD_TO_QUOTE");

  if (shouldAddProducts && input.decision.productRequests.length > 0) {
    for (const productRequest of input.decision.productRequests) {
      const { result, displayName, usedContext } = await addProductRequestToQuote({
        quoteId: input.quoteId,
        conversationId: input.conversationId,
        productRequest
      });

      if ("needsConfirmation" in result && result.needsConfirmation) {
        const productName = result.searchResult.product?.name;

        needsConfirmation.push(
          productName
            ? `${productRequest.originalText} → posible: ${productName}`
            : productRequest.originalText
        );

        continue;
      }

      if ("quote" in result && result.quote) {
        const productName =
          result.searchResult.product?.name || displayName;

        addedProducts.push(
          `${productRequest.quantity || 1} ${productRequest.unit || ""} ${productName}`.trim()
        );

        const product = result.searchResult.product;

        if (product) {
          await saveLastProductContext({
            conversationId: input.conversationId,
            productId: product.id,
            productName: product.name,
            productUnit: product.unit,
            customerText: productRequest.originalText
          });
        }

        if (usedContext) {
          finalReplyText = `Listo. Agregué ${productRequest.quantity || 1} ${
            productRequest.unit || ""
          } de ${productName} a tu cotización.`.trim();
        }
      }
    }

    const quote = await getQuoteById(input.quoteId);

    if (addedProducts.length > 0) {
      finalReplyText = `Listo. Agregué a tu cotización:\n\n${addedProducts
        .map((item) => `- ${item}`)
        .join("\n")}\n\nTotal actual: ${formatDOP(quote.total)}.`;
    }

    if (needsConfirmation.length > 0) {
      finalReplyText += `\n\nNecesito confirmar estos productos:\n${needsConfirmation
        .map((item) => `- ${item}`)
        .join("\n")}`;
    }

    if (notFoundProducts.length > 0) {
      finalReplyText += `\n\nNo encontré:\n${notFoundProducts
        .map((item) => `- ${item}`)
        .join("\n")}`;
    }
  }

  const shouldOnlySearchProduct =
    !shouldAddProducts &&
    input.decision.intent === "SEARCH_PRODUCT" &&
    input.decision.productRequests.length > 0;

  if (shouldOnlySearchProduct) {
    const productRequest = input.decision.productRequests[0];

    if (productRequest) {
      const result = await searchProduct(
        productRequest.normalizedText || productRequest.originalText
      );

      if (result.status === "FOUND" && result.product) {
        await saveLastProductContext({
          conversationId: input.conversationId,
          productId: result.product.id,
          productName: result.product.name,
          productUnit: result.product.unit,
          customerText: productRequest.originalText
        });

        finalReplyText = `Sí, tenemos ${result.product.name}.\n\nPrecio: ${formatDOP(
          result.product.price
        )}\nExistencia: ${result.product.stock} ${result.product.unit}.\n\n¿Deseas que te lo agregue a una cotización?`;
      } else if (result.status === "NEEDS_CONFIRMATION" && result.product) {
        await saveLastProductContext({
          conversationId: input.conversationId,
          productId: result.product.id,
          productName: result.product.name,
          productUnit: result.product.unit,
          customerText: productRequest.originalText
        });

        finalReplyText = `Creo que te refieres a ${result.product.name}. ¿Deseas que lo use para la cotización?`;
      } else if (result.status === "MULTIPLE_MATCHES") {
        finalReplyText = `Encontré varias opciones. ¿Cuál de estas deseas?\n\n${result.suggestions
          ?.map((product, index) => `${index + 1}. ${product.name}`)
          .join("\n")}`;
      } else {
        finalReplyText =
          "No encontré ese producto registrado. ¿Puedes enviarme el nombre con más detalle o una foto?";
      }
    }
  }

  if (hasGeneratePdfAction || input.decision.intent === "GENERATE_QUOTE") {
    const pdfResult = await generateQuotePdf(input.quoteId);

    pdfUrl = pdfResult.pdfUrl;
    pdfPath = pdfResult.filePath;
    pdfFilename = pdfResult.fileName;

    finalReplyText =
      "Listo. Generé tu cotización en PDF. Te la estoy enviando como archivo adjunto.";
  }

  return {
    replyText: finalReplyText,
    pdfUrl,
    pdfPath,
    pdfFilename,
    addedProducts,
    needsConfirmation,
    notFoundProducts
  };
}