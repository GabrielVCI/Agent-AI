import { Router } from "express";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { requireTenantAccess } from "../middlewares/roles.middleware.js";
import {
  maintenanceCountersController,
  maintenanceScheduleController,
  maintenanceServicesController,
} from "../controllers/maintenance.controller.js";

export const maintenanceRoutes = Router();

// Sesión + tenant obligatorios: el cronograma expone nombres y teléfonos de
// clientes, así que no hay endpoint público.
maintenanceRoutes.use(requireAuth, requireTenantAccess);

// Solo lectura: el cronograma se DERIVA del historial y del catálogo. Cambiar
// una fecha se hace configurando el servicio o cerrando la cita, nunca
// escribiendo aquí.
maintenanceRoutes.get("/schedule", maintenanceScheduleController);
maintenanceRoutes.get("/counters", maintenanceCountersController);
maintenanceRoutes.get("/services", maintenanceServicesController);
