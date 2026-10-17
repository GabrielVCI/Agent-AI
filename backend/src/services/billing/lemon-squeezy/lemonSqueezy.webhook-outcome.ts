/**
 * Resultado del procesamiento de UN webhook de LemonSqueezy.
 *
 * Vive en su propio módulo para que los handlers no tengan que importar al
 * orquestador (y este sí a ellos): sin esto habría un ciclo de imports.
 *
 * Cada variante tiene una consecuencia HTTP distinta hacia LemonSqueezy:
 *   PROCESSED / DUPLICATE / IGNORED / FAILED → 200 (reintentar no arregla nada)
 *   RETRY                                    → 5xx (fallo TRANSITORIO nuestro:
 *                                              queremos que LS vuelva a mandarlo)
 */
export type WebhookResult =
  | {
      outcome: "PROCESSED";
      eventName: string;
      tenantId: string;
      /** Suscripción local afectada. Ausente cuando el evento solo correlaciona. */
      subscriptionId?: string;
      /** Qué se hizo, para el log y las pruebas. */
      detail?: string;
    }
  | { outcome: "DUPLICATE"; eventName: string }
  | { outcome: "IGNORED"; eventName: string; reason: string }
  | { outcome: "FAILED"; eventName: string; reason: string }
  | { outcome: "RETRY"; eventName: string; reason: string };
