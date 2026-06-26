import { Router } from "express";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { requireTenantAccess } from "../middlewares/roles.middleware.js";
import {
  listProductsController,
  searchProductController,
  searchTechnicalListController,
} from "../controllers/product.controller.js";

export const productRoutes = Router();

productRoutes.use(requireAuth, requireTenantAccess);

productRoutes.get("/search", searchProductController);
productRoutes.post("/search-list", searchTechnicalListController);
productRoutes.get("/", listProductsController);
