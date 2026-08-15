/**
 * Controles anti-spam del lado del cliente. Sin backend propio no hay rate
 * limiting real por IP; esto reduce abuso básico (doble envío, bots rápidos).
 */

export const STORAGE_KEYS = {
  contact: 'sendwary_contact_last_submit',
  waitlist: 'sendwary_waitlist_last_submit',
} as const

export const MIN_FORM_TIME_MS = 3000

/** `true` si ya pasó el cooldown desde el último envío exitoso (sessionStorage, no localStorage). */
export function canSubmitForm(key: string, cooldownMs = 60_000): boolean {
  const lastSubmit = Number(sessionStorage.getItem(key) || 0)
  return Date.now() - lastSubmit > cooldownMs
}

export function markFormSubmitted(key: string): void {
  sessionStorage.setItem(key, String(Date.now()))
}

/** `true` si el formulario se envió sospechosamente rápido (posible bot). */
export function isSubmittedTooFast(formStartedAt: number, minMs: number = MIN_FORM_TIME_MS): boolean {
  return Date.now() - formStartedAt < minMs
}
