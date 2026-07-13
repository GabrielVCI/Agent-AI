import { z } from "zod";

/**
 * Contexto de entrenamiento del negocio (per-tenant).
 *
 * Se guarda como JSON en Tenant.trainingConfig y se inyecta al prompt del
 * agente (mismo builder para POST /api/agents/:id/test y el flujo WhatsApp).
 *
 * No es RAG ni embeddings: es contexto estructurado y editable a mano. Todos
 * los campos son opcionales para que la demo funcione con configuración parcial.
 */

const serviceItemSchema = z.object({
  name: z.string().optional().default(""),
  description: z.string().optional(),
  price: z.string().optional(),
  notes: z.string().optional(),
});

const faqItemSchema = z.object({
  question: z.string().optional().default(""),
  answer: z.string().optional(),
});

const policiesSchema = z.object({
  appointments: z.string().optional(),
  cancellations: z.string().optional(),
  deliveries: z.string().optional(),
  returns: z.string().optional(),
  warranties: z.string().optional(),
});

export const trainingConfigSchema = z
  .object({
    businessDescription: z.string().optional(),
    customInstructions: z.string().optional(),
    communicationTone: z.string().optional(),
    services: z.array(serviceItemSchema).optional(),
    faqs: z.array(faqItemSchema).optional(),
    schedule: z.string().optional(),
    address: z.string().optional(),
    serviceAreas: z.string().optional(),
    policies: policiesSchema.optional(),
    escalationRules: z.string().optional(),
    welcomeMessage: z.string().optional(),
    outOfHoursMessage: z.string().optional(),
    fallbackMessage: z.string().optional(),
    forbiddenTopics: z.string().optional(),
  })
  // Ignora claves desconocidas en lugar de fallar (robustez para demo).
  .strip();

export type TrainingConfig = z.infer<typeof trainingConfigSchema>;
