import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import path from "path";

import { env } from "./config/env.js";
import { router } from "./routes/index.js";
import {
  errorHandler,
  notFoundHandler
} from "./middlewares/error.middleware.js";

export const app = express();

app.use(helmet());

app.use(
  cors({
    origin: env.corsOrigins,
    credentials: true
  })
);

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

const storagePath = path.resolve(process.cwd(), env.STORAGE_PATH);

app.use(
  "/files",
  express.static(storagePath, {
    fallthrough: false
  })
);

if (env.NODE_ENV !== "test") {
  app.use(morgan("dev"));
}

app.use(router);

app.use(notFoundHandler);
app.use(errorHandler);