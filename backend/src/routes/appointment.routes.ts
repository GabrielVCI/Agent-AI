import { Router } from "express";
import multer from "multer";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { requireRole, requireTenantAccess } from "../middlewares/roles.middleware.js";
import { uploadRateLimit } from "../middlewares/rate-limit.middleware.js";
import {
  listAppointmentsController,
  createAppointmentController,
  getAppointmentController,
  updateAppointmentController,
  appointmentStatusController,
  confirmAppointmentController,
  cancelAppointmentController,
  rescheduleAppointmentController,
  noShowAppointmentController,
  completeAppointmentController,
  reopenAppointmentController,
  listAppointmentLinesController,
  addAppointmentLineController,
  updateAppointmentLineController,
  removeAppointmentLineController,
  processRemindersController,
  getAppointmentSettingsController,
  updateAppointmentSettingsController,
  exportAppointmentsExcelController,
  appointmentsTemplateExcelController,
  importAppointmentsExcelController,
} from "../controllers/appointment.controller.js";

export const appointmentRoutes = Router();

appointmentRoutes.use(requireAuth, requireTenantAccess);

const canManage = requireRole("OWNER", "ADMIN");

// Upload de Excel en memoria (nunca toca disco); 5 MB máximo.
const excelUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
});

// Rutas específicas ANTES de /:id para que Express no las capture como id
appointmentRoutes.post("/process-reminders", canManage, processRemindersController);
appointmentRoutes.get("/settings", getAppointmentSettingsController);
appointmentRoutes.put("/settings", canManage, updateAppointmentSettingsController);

// Excel (Parte E): solo OWNER/ADMIN
appointmentRoutes.get("/export/excel", canManage, exportAppointmentsExcelController);
appointmentRoutes.get("/template/excel", canManage, appointmentsTemplateExcelController);
appointmentRoutes.post(
  "/import/excel",
  uploadRateLimit,
  canManage,
  excelUpload.single("file"),
  importAppointmentsExcelController
);

appointmentRoutes.get("/", listAppointmentsController);
appointmentRoutes.post("/", canManage, createAppointmentController);
appointmentRoutes.get("/:id", getAppointmentController);
appointmentRoutes.put("/:id", canManage, updateAppointmentController);
appointmentRoutes.patch("/:id/status", canManage, appointmentStatusController);
appointmentRoutes.post("/:id/confirm", canManage, confirmAppointmentController);
appointmentRoutes.post("/:id/cancel", canManage, cancelAppointmentController);
appointmentRoutes.post("/:id/reschedule", canManage, rescheduleAppointmentController);
appointmentRoutes.post("/:id/no-show", canManage, noShowAppointmentController);
appointmentRoutes.post("/:id/complete", canManage, completeAppointmentController);
// Corrección de un cierre equivocado: revierte historial y recalcula métricas.
appointmentRoutes.post("/:id/reopen", canManage, reopenAppointmentController);

// Servicios y productos de la cita (Módulo 3). Una cita ya cerrada es
// historial: el servicio rechaza editar sus líneas hasta reabrirla.
appointmentRoutes.get("/:id/lines", listAppointmentLinesController);
appointmentRoutes.post("/:id/lines", canManage, addAppointmentLineController);
appointmentRoutes.patch("/:id/lines/:lineId", canManage, updateAppointmentLineController);
appointmentRoutes.delete("/:id/lines/:lineId", canManage, removeAppointmentLineController);
