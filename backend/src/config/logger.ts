import { createLogger, format, transports } from "winston";
import { env } from "./env.js";

export const logger = createLogger({
  level: env.LOG_LEVEL,
  format: format.combine(
    format.timestamp(),
    env.NODE_ENV === "production"
      ? format.json()
      : format.combine(format.colorize(), format.simple())
  ),
  transports: [new transports.Console()],
});
