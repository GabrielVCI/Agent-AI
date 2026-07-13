import { Router } from "express";
import {
  onboardingStatusController,
  completeOnboardingController,
} from "../controllers/onboarding.controller.js";
import { requireAuth } from "../middlewares/auth.middleware.js";

export const onboardingRoutes = Router();

onboardingRoutes.use(requireAuth);

onboardingRoutes.get("/status", onboardingStatusController);
onboardingRoutes.post("/", completeOnboardingController);
