import { Router } from "express";
import { healthController } from "../controllers/health.controller.js";
import { whatsappRoutes } from "./whatsapp.routes.js";
import { productRoutes } from "./product.routes.js";
import { quoteRoutes } from "./quote.routes.js";
import { conversationRoutes } from "./conversation.routes.js";
import { getOpenAIClient } from "../config/openai.js";
import { env } from "../config/env.js";
import { runSalesAgent } from "../services/agent.service.js";
export const router = Router();

router.get("/health", healthController);

router.get("/api/test-openai", async (_req, res) => {
  const client = getOpenAIClient();

  if (!client) {
    return res.status(500).json({
      success: false,
      message: "OPENAI_API_KEY no está configurada"
    });
  }

  try {
    const response = await client.responses.create({
      model: env.OPENAI_MODEL,
      input: [
        {
          role: "system",
          content: "Responde únicamente con la palabra OK. No agregues explicación."
        },
        {
          role: "user",
          content: "Prueba de conexión"
        }
      ],
      temperature: 0
    });

    return res.json({
      success: true,
      model: env.OPENAI_MODEL,
      output: response.output_text
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error?.message,
      status: error?.status,
      code: error?.code,
      type: error?.type
    });
  }
});

router.post("/api/test-agent-decision", async (req, res) => {
  try {
    const result = await runSalesAgent({
      customerName: req.body.customerName || "Cliente",
      message: req.body.message,
      quoteNumber: req.body.quoteNumber || null,
      conversationHistory: req.body.conversationHistory || []
    });

    return res.json({
      success: true,
      data: result
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error?.message,
      status: error?.status,
      code: error?.code,
      type: error?.type
    });
  }
});

router.use("/api/whatsapp", whatsappRoutes);
router.use("/api/products", productRoutes);
router.use("/api/quotes", quoteRoutes);
router.use("/api/conversations", conversationRoutes);