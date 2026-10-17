import { Router } from "express";
import multer from "multer";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { requireRole, requireTenantAccess } from "../middlewares/roles.middleware.js";
import { uploadRateLimit } from "../middlewares/rate-limit.middleware.js";
import {
  listCustomersController,
  customerCountersController,
  customerTagsController,
  getCustomerController,
  customerSummaryController,
  customerTimelineController,
  customerAppointmentsController,
  createCustomerController,
  updateCustomerController,
  archiveCustomerController,
  importCustomersController,
  previewCustomersImportController,
  customersTemplateController,
  customerFollowUpsController,
  cancelFollowUpController,
  rescheduleFollowUpController,
} from "../controllers/customer.controller.js";
import {
  assignCustomerCategoryController,
  customerCategoriesController,
  removeCustomerCategoryController,
} from "../controllers/customer-category.controller.js";

export const customerRoutes = Router();

// Sesión + tenant obligatorios en TODA la ruta: no hay endpoint público del
// maestro y el tenant sale siempre de la cookie, nunca del cliente.
customerRoutes.use(requireAuth, requireTenantAccess);

const canManage = requireRole("OWNER", "ADMIN");

/**
 * Subida en MEMORIA (el archivo nunca toca disco ni acepta rutas del cliente).
 * 5 MB y un solo archivo; el límite de filas lo aplica el servicio.
 */
const customerUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
});

// Rutas específicas ANTES de /:id (si no, Express las tomaría como un id)
customerRoutes.get("/counters", customerCountersController);
customerRoutes.get("/tags", customerTagsController);
customerRoutes.get("/import/template", canManage, customersTemplateController);
customerRoutes.post(
  "/import/preview",
  uploadRateLimit,
  canManage,
  customerUpload.single("file"),
  previewCustomersImportController
);
customerRoutes.post(
  "/import",
  uploadRateLimit,
  canManage,
  customerUpload.single("file"),
  importCustomersController
);

customerRoutes.get("/", listCustomersController);
customerRoutes.post("/", canManage, createCustomerController);

customerRoutes.get("/:id", getCustomerController);
customerRoutes.get("/:id/summary", customerSummaryController);
customerRoutes.get("/:id/timeline", customerTimelineController);
customerRoutes.get("/:id/appointments", customerAppointmentsController);
// Próximos seguimientos (Módulo 3). Son AutomationJob reales del Módulo 0:
// cancelarlos y moverlos pasa por el motor, no se borran filas.
customerRoutes.get("/:id/followups", customerFollowUpsController);
customerRoutes.delete("/:id/followups/:jobId", canManage, cancelFollowUpController);
customerRoutes.patch("/:id/followups/:jobId", canManage, rescheduleFollowUpController);
// Segmentación del cliente (Módulo 2). La asignación es idempotente y solo
// acepta categorías manuales activas del MISMO tenant.
customerRoutes.get("/:id/categories", customerCategoriesController);
customerRoutes.post("/:id/categories/:categoryId", canManage, assignCustomerCategoryController);
customerRoutes.delete("/:id/categories/:categoryId", canManage, removeCustomerCategoryController);
customerRoutes.patch("/:id", canManage, updateCustomerController);
// No hay DELETE físico: de un cliente cuelgan conversaciones, citas,
// cotizaciones y automatizaciones. Se archiva.
customerRoutes.patch("/:id/archive", canManage, archiveCustomerController);
