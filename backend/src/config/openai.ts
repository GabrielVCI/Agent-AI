// import OpenAI from "openai";
// import { env } from "./env.js";

// export function getOpenAIClient() {
//   console.log("🔎 OPENAI_API_KEY existe:", Boolean(env.OPENAI_API_KEY));
//   console.log("🔎 OPENAI_MODEL:", env.OPENAI_MODEL);

//   if (!env.OPENAI_API_KEY) {
//     console.warn("⚠️ OPENAI_API_KEY no está configurada. Usando fallback.");
//     return null;
//   }

//   return new OpenAI({
//     apiKey: env.OPENAI_API_KEY
//   });
// }


import OpenAI from "openai";
import { env } from "./env.js";

let openaiClient: OpenAI | null = null;

export function getOpenAIClient() {
  if (!env.OPENAI_API_KEY) {
    console.warn("⚠️ OPENAI_API_KEY no está configurada.");
    return null;
  }

  if (!openaiClient) {
    console.log("✅ Cliente OpenAI inicializado");
    console.log("🔎 OPENAI_MODEL:", env.OPENAI_MODEL);

    openaiClient = new OpenAI({
      apiKey: env.OPENAI_API_KEY,
      timeout: 30_000,
      maxRetries: 2
    });
  }

  return openaiClient;
}