import { Router } from "express";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { requireTenantAccess } from "../middlewares/roles.middleware.js";
import {
  addQuoteItemBySearchController,
  addQuoteItemController,
  generateQuotePdfController,
  getQuoteController,
  recalculateQuoteController,
  removeQuoteItemController,
} from "../controllers/quote.controller.js";

export const quoteRoutes = Router();

quoteRoutes.use(requireAuth, requireTenantAccess);

quoteRoutes.get("/:id", getQuoteController);
quoteRoutes.get("/:id/pdf", generateQuotePdfController);
quoteRoutes.post("/:id/items", addQuoteItemController);
quoteRoutes.post("/:id/items/search", addQuoteItemBySearchController);
quoteRoutes.delete("/:id/items/:lineId", removeQuoteItemController);
quoteRoutes.post("/:id/recalculate", recalculateQuoteController);
