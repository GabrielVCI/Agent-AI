import { Router } from "express";
import {
  loginController,
  registerController,
  googleStartController,
  googleCallbackController,
  logoutController,
  logoutAllController,
  meController,
  sessionsController,
  forgotPasswordController,
  validateResetTokenController,
  resetPasswordController,
} from "../controllers/auth.controller.js";
import { requireAuth } from "../middlewares/auth.middleware.js";
import {
  authRateLimit,
  registerRateLimit,
  oauthRateLimit,
} from "../middlewares/rate-limit.middleware.js";

export const authRoutes = Router();

authRoutes.post("/login", authRateLimit, loginController);
authRoutes.post("/register", registerRateLimit, registerController);
authRoutes.get("/google", oauthRateLimit, googleStartController);
authRoutes.get("/google/callback", oauthRateLimit, googleCallbackController);
authRoutes.post("/forgot-password", authRateLimit, forgotPasswordController);
authRoutes.get("/reset-password/validate", authRateLimit, validateResetTokenController);
authRoutes.post("/reset-password", authRateLimit, resetPasswordController);
authRoutes.post("/logout", logoutController);
authRoutes.post("/logout-all", requireAuth, logoutAllController);
authRoutes.get("/me", requireAuth, meController);
authRoutes.get("/sessions", requireAuth, sessionsController);
