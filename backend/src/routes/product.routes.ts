import { Router } from "express";
import {
  listProductsController,
  searchProductController,
  searchTechnicalListController
} from "../controllers/product.controller.js";

export const productRoutes = Router();

productRoutes.get("/search", searchProductController);
productRoutes.post("/search-list", searchTechnicalListController);
productRoutes.get("/", listProductsController);