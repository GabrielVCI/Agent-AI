import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import path from "path";

import { env } from "./config/env.js";
import { router } from "./routes/index.js";
import { errorHandler, notFoundHandler } from "./middlewares/error.middleware.js";
import { globalRateLimit } from "./middlewares/rate-limit.middleware.js";

export const app = express();

app.set("trust proxy", 1);

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);

app.use(
  cors({
    origin: env.corsOrigins,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(
  express.json({
    limit: "2mb",
    // Cuerpo crudo preservado para validar firmas HMAC de webhooks
    // (LemonSqueezy firma el payload exacto; ver billing webhook).
    verify: (req, _res, buf) => {
      (req as unknown as { rawBody?: Buffer }).rawBody = buf;
    },
  })
);
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

const storagePath = path.resolve(process.cwd(), env.STORAGE_PATH);
app.use("/files", express.static(storagePath, { fallthrough: false }));

if (env.NODE_ENV !== "test") {
  app.use(morgan("dev"));
}

// Paraguas global de /api (por usuario/tenant autenticado o IP anónima).
// Los grupos sensibles (auth, admin, IA, webhooks...) tienen limiters propios
// en sus rutas. /files (estáticos) queda fuera a propósito.
app.use("/api", globalRateLimit);
app.use(router);

app.use(notFoundHandler);
app.use(errorHandler);
