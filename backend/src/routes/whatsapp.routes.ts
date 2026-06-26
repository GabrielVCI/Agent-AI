import { Router } from "express";
import {
  incomingMetaWhatsappWebhookController,
  verifyMetaWhatsappWebhookController,
} from "../controllers/whatsapp.controller.js";
import { webhookRateLimit } from "../middlewares/rate-limit.middleware.js";

export const whatsappRoutes = Router();

// Meta webhook verification (GET) and incoming messages (POST).
// Se exponen dos rutas equivalentes: /meta (interna) y /webhook (la que se
// suele configurar en el panel de Meta). Ambas apuntan al mismo controlador.
whatsappRoutes.get("/meta", verifyMetaWhatsappWebhookController);
whatsappRoutes.post("/meta", webhookRateLimit, incomingMetaWhatsappWebhookController);
whatsappRoutes.get("/webhook", verifyMetaWhatsappWebhookController);
whatsappRoutes.post("/webhook", webhookRateLimit, incomingMetaWhatsappWebhookController);
