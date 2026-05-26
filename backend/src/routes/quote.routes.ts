import { Router } from "express";
import {
  addQuoteItemBySearchController,
  addQuoteItemController,
  createQuoteController,
  generateQuotePdfController,
  getQuoteController,
  recalculateQuoteController,
  removeQuoteItemController
} from "../controllers/quote.controller.js";

export const quoteRoutes = Router();

quoteRoutes.post("/", createQuoteController);
quoteRoutes.get("/:id", getQuoteController);
quoteRoutes.get("/:id/pdf", generateQuotePdfController);
quoteRoutes.post("/:id/items", addQuoteItemController);
quoteRoutes.post("/:id/items/search", addQuoteItemBySearchController);
quoteRoutes.delete("/:id/items/:lineId", removeQuoteItemController);
quoteRoutes.post("/:id/recalculate", recalculateQuoteController);