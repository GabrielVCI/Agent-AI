import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import path from "path";

import { env } from "./config/env.js";
import { router } from "./routes/index.js";
import { errorHandler, notFoundHandler } from "./middlewares/error.middleware.js";
import { apiRateLimit } from "./middlewares/rate-limit.middleware.js";

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

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

const storagePath = path.resolve(process.cwd(), env.STORAGE_PATH);
app.use("/files", express.static(storagePath, { fallthrough: false }));

if (env.NODE_ENV !== "test") {
  app.use(morgan("dev"));
}

app.use("/api", apiRateLimit);
app.use(router);

app.use(notFoundHandler);
app.use(errorHandler);
