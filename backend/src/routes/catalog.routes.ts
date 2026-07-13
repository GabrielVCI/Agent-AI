import { Router } from "express";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { requireRole, requireTenantAccess } from "../middlewares/roles.middleware.js";
import {
  listCategoriesController,
  createCategoryController,
  updateCategoryController,
  categoryStatusController,
  deleteCategoryController,
  listItemsController,
  createItemController,
  getItemController,
  updateItemController,
  itemStatusController,
  deleteItemController,
} from "../controllers/catalog.controller.js";

export const catalogRoutes = Router();

catalogRoutes.use(requireAuth, requireTenantAccess);

const canManage = requireRole("OWNER", "ADMIN");

// Categorías
catalogRoutes.get("/categories", listCategoriesController);
catalogRoutes.post("/categories", canManage, createCategoryController);
catalogRoutes.put("/categories/:id", canManage, updateCategoryController);
catalogRoutes.patch("/categories/:id/status", canManage, categoryStatusController);
catalogRoutes.delete("/categories/:id", canManage, deleteCategoryController);

// Ítems (productos/servicios)
catalogRoutes.get("/items", listItemsController);
catalogRoutes.post("/items", canManage, createItemController);
catalogRoutes.get("/items/:id", getItemController);
catalogRoutes.put("/items/:id", canManage, updateItemController);
catalogRoutes.patch("/items/:id/status", canManage, itemStatusController);
catalogRoutes.delete("/items/:id", canManage, deleteItemController);
