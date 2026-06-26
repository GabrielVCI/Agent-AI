import { Router } from "express";
import {
  loginController,
  logoutController,
  logoutAllController,
  meController,
  sessionsController,
} from "../controllers/auth.controller.js";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { authRateLimit } from "../middlewares/rate-limit.middleware.js";

export const authRoutes = Router();

authRoutes.post("/login", authRateLimit, loginController);
authRoutes.post("/logout", logoutController);
authRoutes.post("/logout-all", requireAuth, logoutAllController);
authRoutes.get("/me", requireAuth, meController);
authRoutes.get("/sessions", requireAuth, sessionsController);
