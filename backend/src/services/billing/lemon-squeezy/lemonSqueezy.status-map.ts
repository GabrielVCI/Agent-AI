import type { PaymentStatus, SubscriptionStatus } from "@prisma/client";

/**
 * ÚNICO punto de traducción de estados de LemonSqueezy.
 *
 * Ningún otro archivo hace `switch` sobre `active`/`past_due`/`cancelled`: si
 * la política cambia, cambia aquí y en ningún sitio más.
 *
 * Tabla (estado LS → SubscriptionStatus de Sendwary):
 *
 *   on_trial  → TRIALING
 *   active    → ACTIVE
 *   paused    → PAST_DUE   (sin acceso pagado corriendo; el detalle real queda
 *                           en lemonSqueezyStatus y lemonSqueezyPauseJson)
 *   past_due  → PAST_DUE   (dunning: BillingService da 3 días de gracia)
 *   unpaid    → PAST_DUE   (el enum no tiene UNPAID; no se inventa un estado
 *                           nuevo. paymentStatus=OVERDUE + lemonSqueezyStatus
 *                           conservan la diferencia para soporte)
 *   cancelled → CANCELLED  (OJO: sigue habiendo acceso hasta endsAt, ver
 *                           billing.service.ts)
 *   expired   → EXPIRED
 */

export type LemonSubscriptionStatus =
  | "on_trial"
  | "active"
  | "paused"
  | "past_due"
  | "unpaid"
  | "cancelled"
  | "expired";

/** Estado interno equivalente, o null si LS mandó algo que no conocemos. */
export function mapLemonSubscriptionStatus(
  lemonStatus: string | null | undefined
): SubscriptionStatus | null {
  switch (lemonStatus) {
    case "on_trial":
      return "TRIALING";
    case "active":
      return "ACTIVE";
    case "paused":
    case "past_due":
    case "unpaid":
      return "PAST_DUE";
    case "cancelled":
      return "CANCELLED";
    case "expired":
      return "EXPIRED";
    default:
      return null;
  }
}

/**
 * Estado de PAGO derivado del estado de la suscripción.
 *
 * `status` y `paymentStatus` son conceptos distintos y se mantienen separados:
 * una suscripción CANCELLED puede estar PAID (pagada hasta endsAt), y una
 * ACTIVE puede estar OVERDUE justo antes de que LS la mande a past_due.
 * Devuelve null cuando el estado no dice nada del pago (no se pisa el valor
 * que ya haya).
 */
export function paymentStatusForLemonStatus(
  lemonStatus: string | null | undefined
): PaymentStatus | null {
  switch (lemonStatus) {
    case "active":
    case "cancelled": // cancelada pero pagada hasta el fin del período
      return "PAID";
    case "on_trial":
      return "NOT_REQUIRED";
    case "past_due":
    case "unpaid":
      return "OVERDUE";
    case "expired":
      // Terminó: ya no se le exige pago a esta suscripción.
      return "NOT_REQUIRED";
    case "paused":
    default:
      return null;
  }
}
