import { Router } from "express";
import { incomingMetaWhatsappWebhookController, incomingWhatsappController, verifyMetaWhatsappWebhookController } from "../controllers/whatsapp.controller.js";

export const whatsappRoutes = Router();

whatsappRoutes.post("/incoming", incomingWhatsappController);

whatsappRoutes.get("/meta", verifyMetaWhatsappWebhookController);
whatsappRoutes.post("/meta", incomingMetaWhatsappWebhookController);