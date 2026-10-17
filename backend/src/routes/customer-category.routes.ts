import { Router } from "express";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { requireRole, requireTenantAccess } from "../middlewares/roles.middleware.js";
import {
  archiveCategoryController,
  bulkCategoryController,
  createCategoryController,
  getCategoryController,
  listCategoriesController,
  updateCategoryController,
} from "../controllers/customer-category.controller.js";

export const customerCategoryRoutes = Router();

// Sesión + tenant obligatorios en TODA la ruta: no hay endpoint público de
// segmentación y el tenant sale siempre de la cookie, nunca del cliente.
customerCategoryRoutes.use(requireAuth, requireTenantAccess);

const canManage = requireRole("OWNER", "ADMIN");

customerCategoryRoutes.get("/", listCategoriesController);
customerCategoryRoutes.post("/", canManage, createCategoryController);

customerCategoryRoutes.get("/:id", getCategoryController);
customerCategoryRoutes.patch("/:id", canManage, updateCategoryController);
// No hay DELETE físico: una categoría que ya estuvo asignada es historial de
// segmentación del negocio. Se archiva (y se restaura con archived=false).
customerCategoryRoutes.patch("/:id/archive", canManage, archiveCategoryController);
customerCategoryRoutes.post("/:id/customers", canManage, bulkCategoryController);
