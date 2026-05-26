// import dotenv from "dotenv";
// import { z } from "zod";

// dotenv.config();

// const envSchema = z.object({
//   NODE_ENV: z
//     .enum(["development", "test", "production"])
//     .default("development"),

//   PORT: z.coerce.number().default(3002),

//   BACKEND_PUBLIC_URL: z.string().url().default("http://localhost:3002"),

//   CORS_ORIGIN: z.string().default("http://localhost:5173,http://localhost:5678")
// });

// const parsedEnv = envSchema.safeParse(process.env);

// if (!parsedEnv.success) {
//   console.error("❌ Error en variables de entorno:");
//   console.error(parsedEnv.error.flatten().fieldErrors);
//   process.exit(1);
// }

// export const env = {
//   ...parsedEnv.data,
//   corsOrigins: parsedEnv.data.CORS_ORIGIN.split(",").map((origin) =>
//     origin.trim()
//   )
// };
import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();
const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  PORT: z.coerce.number().default(3002),

  BACKEND_PUBLIC_URL: z.string().url().default("http://localhost:3002"),

  CORS_ORIGIN: z.string().default("http://localhost:5173,http://localhost:5678"),

  STORAGE_PATH: z.string().default("../storage"),

  DATABASE_URL: z.string().min(1, "DATABASE_URL es obligatoria"),

  OPENAI_API_KEY: z.string().optional(),

  OPENAI_MODEL: z.string().default("gpt-4.1-mini"),

  META_VERIFY_TOKEN: z.string().optional(),
  META_WHATSAPP_TOKEN: z.string().optional(),
  META_PHONE_NUMBER_ID: z.string().optional(),
  META_GRAPH_API_VERSION: z.string().default("v20.0")
});
const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error("❌ Error en variables de entorno:");
  console.error(parsedEnv.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = {
  ...parsedEnv.data,
  corsOrigins: parsedEnv.data.CORS_ORIGIN.split(",").map((origin) =>
    origin.trim()
  )
};