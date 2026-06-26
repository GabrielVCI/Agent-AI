import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma.js";
import { generateQuotePdf } from "./pdf.service.js";
import { addQuoteItemBySearch, getQuoteById } from "./quote.service.js";
import { searchProductForTenant } from "./product.service.js";
import type { AgentDecision, AgentProductRequest } from "../types/agent.types.js";

type ExecuteAgentActionsInput = {
  decision: AgentDecision;
  quoteId: string;
  conversationId: string;
  tenantId: string;
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
    maximumFractionDigits: 2,
  })}`;
}

function getConversationMeta(
  metadata: Prisma.JsonValue | null
): Record<string, any> {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return {};
  return metadata as Record<string, any>;
}

async function getLastProductContext(
  conversationId: string
): Promise<LastProductContext | null> {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { metadata: true },
  });
  const meta = getConversationMeta(conversation?.metadata ?? null);
  return (meta.lastProductContext as LastProductContext) ?? null;
}

async function saveLastProductContext(input: {
  conversationId: string;
  productId: string;
  productName: string;
  productUnit?: string | null;
  customerText?: string | null;
}) {
  const conversation = await prisma.conversation.findUnique({
    where: { id: input.conversationId },
    select: { metadata: true },
  });
  const meta = getConversationMeta(conversation?.metadata ?? null);
  meta.lastProductContext = {
    productId: input.productId,
    productName: input.productName,
    productUnit: input.productUnit ?? null,
    customerText: input.customerText ?? null,
    updatedAt: new Date().toISOString(),
  };
  await prisma.conversation.update({
    where: { id: input.conversationId },
    data: { metadata: meta as Prisma.InputJsonValue },
  });
}

function looksLikeQuantityOnlyRequest(pr: AgentProductRequest): boolean {
  const normalized = pr.normalizedText.trim().toLowerCase();
  const quantity = pr.quantity || 1;
  const unit = pr.unit?.trim();

  if (quantity <= 1 && !unit) return false;

  const weakWords = [
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
    "paquetes",
  ];

  if (weakWords.includes(normalized)) return true;

  const textWithoutNumbers = pr.originalText
    .toLowerCase()
    .replace(/[0-9]+/g, "")
    .replace(
      /\b(agrega|agregame|agrégame|cotiza|cotizame|cotízame|ponme|quiero|necesito|de|del|la|el|los|las|a|mi|cotizacion|cotización)\b/g,
      ""
    )
    .trim();

  return weakWords.includes(textWithoutNumbers);
}

async function addProductRequestToQuote(input: {
  quoteId: string;
  conversationId: string;
  tenantId: string;
  productRequest: AgentProductRequest;
}) {
  const lastProductContext = await getLastProductContext(input.conversationId);

  if (lastProductContext && looksLikeQuantityOnlyRequest(input.productRequest)) {
    const result = await addQuoteItemBySearch(input.quoteId, input.tenantId, {
      query: lastProductContext.productName,
      quantity: input.productRequest.quantity || 1,
    });
    return { result, displayName: lastProductContext.productName, usedContext: true };
  }

  const query = input.productRequest.normalizedText || input.productRequest.originalText;
  const result = await addQuoteItemBySearch(input.quoteId, input.tenantId, {
    query,
    quantity: input.productRequest.quantity || 1,
  });
  return { result, displayName: query, usedContext: false };
}

export async function executeAgentActions(input: ExecuteAgentActionsInput) {
  const addedProducts: string[] = [];
  const needsConfirmation: string[] = [];
  const notFoundProducts: string[] = [];

  let pdfUrl: string | null = null;
  let pdfPath: string | null = null;
  let pdfFilename: string | null = null;
  let finalReplyText = input.decision.replyText;

  const hasGeneratePdfAction = input.decision.actions.some((a) => a.type === "GENERATE_PDF");

  const shouldAddProducts =
    input.decision.intent === "ADD_TO_QUOTE" ||
    input.decision.actions.some((a) => a.type === "ADD_TO_QUOTE");

  if (shouldAddProducts && input.decision.productRequests.length > 0) {
    for (const productRequest of input.decision.productRequests) {
      try {
        const { result, displayName, usedContext } = await addProductRequestToQuote({
          quoteId: input.quoteId,
          conversationId: input.conversationId,
          tenantId: input.tenantId,
          productRequest,
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
          const productName = result.searchResult.product?.name || displayName;
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
              customerText: productRequest.originalText,
            });
          }

          if (usedContext) {
            finalReplyText = `Listo. Agregué ${productRequest.quantity || 1} ${
              productRequest.unit || ""
            } de ${productName} a tu cotización.`.trim();
          }
        }
      } catch {
        notFoundProducts.push(productRequest.originalText);
      }
    }

    const quote = await getQuoteById(input.quoteId, input.tenantId);

    if (addedProducts.length > 0) {
      finalReplyText = `Listo. Agregué a tu cotización:\n\n${addedProducts
        .map((item) => `- ${item}`)
        .join("\n")}\n\nTotal actual: ${formatDOP(quote.total)}.`;
    }

    if (needsConfirmation.length > 0) {
      finalReplyText += `\n\nNecesito confirmar:\n${needsConfirmation.map((i) => `- ${i}`).join("\n")}`;
    }

    if (notFoundProducts.length > 0) {
      finalReplyText += `\n\nNo encontré:\n${notFoundProducts.map((i) => `- ${i}`).join("\n")}`;
    }
  }

  const shouldOnlySearchProduct =
    !shouldAddProducts &&
    input.decision.intent === "SEARCH_PRODUCT" &&
    input.decision.productRequests.length > 0;

  if (shouldOnlySearchProduct) {
    const productRequest = input.decision.productRequests[0];

    if (productRequest) {
      const result = await searchProductForTenant(
        productRequest.normalizedText || productRequest.originalText,
        input.tenantId
      );

      if (result.status === "FOUND" && result.product) {
        await saveLastProductContext({
          conversationId: input.conversationId,
          productId: result.product.id,
          productName: result.product.name,
          productUnit: result.product.unit,
          customerText: productRequest.originalText,
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
          customerText: productRequest.originalText,
        });
        finalReplyText = `Creo que te refieres a ${result.product.name}. ¿Deseas que lo use para la cotización?`;
      } else if (result.status === "MULTIPLE_MATCHES") {
        finalReplyText = `Encontré varias opciones:\n\n${result.suggestions
          ?.map((p, i) => `${i + 1}. ${p.name}`)
          .join("\n")}`;
      } else {
        finalReplyText =
          "No encontré ese producto. ¿Puedes enviarme el nombre con más detalle?";
      }
    }
  }

  if (hasGeneratePdfAction || input.decision.intent === "GENERATE_QUOTE") {
    const pdfResult = await generateQuotePdf(input.quoteId, input.tenantId);
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
    notFoundProducts,
  };
}
