/**
 * Tests de integración del motor contra PostgreSQL real.
 *
 * Seguridad de los datos: cada corrida crea SUS PROPIOS tenants con prefijo
 * `__automation_test__` y los borra al final (cascade limpia reglas, jobs,
 * ejecuciones y mensajes programados). No lee, modifica ni borra nada
 * preexistente. Si no hay base de datos alcanzable, la suite falla con un
 * mensaje claro en vez de "pasar" silenciosamente.
 *
 * Ejecutar: npm run test:db
 */
// Carga .env ANTES que cualquier módulo del backend: config/prisma.ts lee
// process.env.DATABASE_URL al importarse.
import "dotenv/config";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "crypto";

import { prisma } from "../src/config/prisma.js";
import { closeRedis } from "../src/config/redis.js";
import { emitAutomationEventOrThrow } from "../src/services/automation/automation-events.service.js";
import {
  cancelJobById,
  claimDueJobs,
  completeJob,
  failJobAttempt,
  listExecutions,
  listJobs,
  recoverStaleJobs,
  rescheduleJob,
} from "../src/services/automation/automation-jobs.service.js";
import {
  archiveRule,
  createRule,
  getRule,
  listRules,
  updateRule,
} from "../src/services/automation/automation-rules.service.js";
import { runClaimedJob } from "../src/services/automation/automation-worker.js";
import { whatsappMessageExecutor } from "../src/services/automation/executors/whatsapp-message.executor.js";
import { AutomationActionError } from "../src/services/automation/automation-errors.js";

const PREFIX = "__automation_test__";
const createdTenantIds: string[] = [];

async function createTenant(label: string): Promise<string> {
  const tenant = await prisma.tenant.create({
    data: {
      name: `${PREFIX}${label}-${randomUUID().slice(0, 8)}`,
      timezone: "America/Santo_Domingo",
      status: "ACTIVE",
    },
  });
  createdTenantIds.push(tenant.id);
  return tenant.id;
}

async function createCustomer(tenantId: string, phone: string) {
  return prisma.customer.create({
    data: { tenantId, phone, name: "Cliente de prueba" },
  });
}

/** Regla base: WhatsApp inmediato al completarse una cita. */
async function createImmediateRule(tenantId: string, overrides: Record<string, unknown> = {}) {
  return createRule(tenantId, {
    name: "Regla de prueba",
    eventType: "APPOINTMENT_COMPLETED",
    status: "ACTIVE",
    actionType: "SEND_WHATSAPP_MESSAGE",
    actionConfig: { template: "Hola {{nombre}}, gracias por tu visita a {{negocio}}." },
    scheduleStrategy: "IMMEDIATE",
    ...overrides,
  } as never);
}

before(async () => {
  // Falla temprano y claro si no hay DB: nunca se reporta "verde" sin haber
  // ejercitado nada.
  await prisma.$queryRaw`SELECT 1`;
});

after(async () => {
  for (const tenantId of createdTenantIds) {
    await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => {});
  }
  await prisma.$disconnect();
  // El cliente de Redis (caché del dashboard) reintenta conectar de forma
  // indefinida: sin cerrarlo el proceso de tests nunca terminaría.
  await closeRedis().catch(() => {});
});

// ─── Aislamiento multi-tenant ────────────────────────────────────────────────

test("aislamiento: un tenant no ve ni toca reglas, jobs ni ejecuciones de otro", async () => {
  const tenantA = await createTenant("iso-a");
  const tenantB = await createTenant("iso-b");

  const ruleA = await createImmediateRule(tenantA);
  const customerA = await createCustomer(tenantA, `+1809${Date.now() % 10_000_000}`);

  await emitAutomationEventOrThrow({
    tenantId: tenantA,
    type: "APPOINTMENT_COMPLETED",
    source: "test",
    entityType: "APPOINTMENT",
    entityId: "appt_iso_1",
    customerId: customerA.id,
    payload: { serviceOrProduct: "Corte" },
  });

  // Listados de B: vacíos
  const rulesOfB = await listRules(tenantB, {});
  assert.equal(rulesOfB.total, 0);
  const jobsOfB = await listJobs(tenantB, {});
  assert.equal(jobsOfB.total, 0);
  const executionsOfB = await listExecutions(tenantB, {});
  assert.equal(executionsOfB.total, 0);

  // Lectura cruzada por id: 404
  await assert.rejects(() => getRule(tenantB, ruleA.id), /No encontramos/);
  // Edición cruzada: 404
  await assert.rejects(() => updateRule(tenantB, ruleA.id, { name: "Secuestrada" }), /No encontramos/);
  // Archivado cruzado: 404
  await assert.rejects(() => archiveRule(tenantB, ruleA.id), /No encontramos/);

  // Cancelación cruzada de un job de A desde B: no hace nada
  const jobsOfA = await listJobs(tenantA, {});
  assert.equal(jobsOfA.total, 1);
  const cancelled = await cancelJobById({
    tenantId: tenantB,
    jobId: jobsOfA.items[0].id,
    reason: "intento cross-tenant",
  });
  assert.equal(cancelled, false);

  const stillActive = await prisma.automationJob.findUnique({
    where: { id: jobsOfA.items[0].id },
    select: { status: true },
  });
  assert.equal(stillActive?.status, "SCHEDULED");
});

test("aislamiento: la regla de un tenant nunca se dispara con el evento de otro", async () => {
  const tenantA = await createTenant("iso-evt-a");
  const tenantB = await createTenant("iso-evt-b");
  await createImmediateRule(tenantA);

  const result = await emitAutomationEventOrThrow({
    tenantId: tenantB,
    type: "APPOINTMENT_COMPLETED",
    source: "test",
    entityId: "appt_iso_2",
  });

  assert.equal(result.matchedRules, 0);
  assert.equal(result.createdJobs, 0);
  assert.equal((await listJobs(tenantB, {})).total, 0);
});

// ─── Idempotencia ────────────────────────────────────────────────────────────

test("idempotencia: el mismo evento dos veces produce una sola automatización", async () => {
  const tenantId = await createTenant("idem");
  await createImmediateRule(tenantId);
  const customer = await createCustomer(tenantId, `+1829${Date.now() % 10_000_000}`);

  const payload = {
    tenantId,
    type: "APPOINTMENT_COMPLETED" as const,
    source: "test",
    entityType: "APPOINTMENT" as const,
    entityId: "appt_idem_1",
    customerId: customer.id,
    idempotencyKey: "APPOINTMENT_COMPLETED:appt_idem_1",
  };

  const first = await emitAutomationEventOrThrow(payload);
  const second = await emitAutomationEventOrThrow(payload);

  assert.equal(first.createdJobs, 1);
  assert.equal(second.processed, false);
  assert.equal(second.reason, "DUPLICATE");
  assert.equal((await listJobs(tenantId, {})).total, 1);
});

test("idempotencia: sin clave de evento, el UNIQUE del job sigue evitando duplicados", async () => {
  const tenantId = await createTenant("idem-job");
  await createImmediateRule(tenantId);

  const payload = {
    tenantId,
    type: "APPOINTMENT_COMPLETED" as const,
    source: "test",
    entityType: "APPOINTMENT" as const,
    entityId: "appt_idem_2",
  };

  await emitAutomationEventOrThrow(payload);
  await emitAutomationEventOrThrow(payload);

  const jobs = await listJobs(tenantId, {});
  assert.equal(jobs.total, 1, "la segunda emisión debe reutilizar el job existente");
});

// ─── Cancelación y reprogramación ────────────────────────────────────────────

test("cancelación: el cliente vuelve y los seguimientos futuros quedan CANCELLED", async () => {
  const tenantId = await createTenant("cancel");
  const customer = await createCustomer(tenantId, `+1849${Date.now() % 10_000_000}`);

  // Seguimiento a 30 días que se cancela si el cliente vuelve.
  await createRule(tenantId, {
    name: "Seguimiento 30 días",
    eventType: "APPOINTMENT_COMPLETED",
    status: "ACTIVE",
    actionType: "SEND_WHATSAPP_MESSAGE",
    actionConfig: { template: "Hola {{nombre}}, ¿te agendamos otra vez?" },
    scheduleStrategy: "DELAY",
    delayMinutes: 30 * 24 * 60,
    cancelOnEventTypes: ["CUSTOMER_VISITED"],
  } as never);

  await emitAutomationEventOrThrow({
    tenantId,
    type: "APPOINTMENT_COMPLETED",
    source: "test",
    entityType: "APPOINTMENT",
    entityId: "appt_cancel_1",
    customerId: customer.id,
  });

  const pending = await listJobs(tenantId, { status: "SCHEDULED" });
  assert.equal(pending.total, 1);

  // El cliente regresa antes de tiempo
  const visit = await emitAutomationEventOrThrow({
    tenantId,
    type: "CUSTOMER_VISITED",
    source: "test",
    entityType: "CUSTOMER",
    entityId: customer.id,
    customerId: customer.id,
  });

  assert.equal(visit.cancelledJobs, 1);
  assert.equal((await listJobs(tenantId, { status: "SCHEDULED" })).total, 0);
  assert.equal((await listJobs(tenantId, { status: "CANCELLED" })).total, 1);
});

test("reprogramación: cambiar la fecha mueve el job, no crea uno segundo", async () => {
  const tenantId = await createTenant("resched");

  await createRule(tenantId, {
    name: "Recordatorio 24h",
    eventType: "APPOINTMENT_CREATED",
    status: "ACTIVE",
    actionType: "SEND_WHATSAPP_MESSAGE",
    actionConfig: { template: "Te recordamos tu cita del {{fecha}}." },
    scheduleStrategy: "RELATIVE_TO_FIELD",
    scheduleConfig: { field: "scheduledAt", offsetMinutes: -24 * 60 },
  } as never);

  const first = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
  const moved = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000);

  await emitAutomationEventOrThrow({
    tenantId,
    type: "APPOINTMENT_CREATED",
    source: "test",
    entityType: "APPOINTMENT",
    entityId: "appt_resched_1",
    payload: { scheduledAt: first.toISOString() },
  });

  await emitAutomationEventOrThrow({
    tenantId,
    type: "APPOINTMENT_CREATED",
    source: "test",
    entityType: "APPOINTMENT",
    entityId: "appt_resched_1",
    payload: { scheduledAt: moved.toISOString() },
  });

  const active = await prisma.automationJob.findMany({
    where: { tenantId, status: { in: ["SCHEDULED", "PENDING", "RETRY_PENDING"] } },
  });
  assert.equal(active.length, 1, "no pueden quedar dos jobs equivalentes activos");
  assert.equal(
    active[0].scheduledFor.toISOString(),
    new Date(moved.getTime() - 24 * 60 * 60 * 1000).toISOString()
  );

  // Reprogramación explícita del mismo job
  const nueva = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const updated = await rescheduleJob({ tenantId, jobId: active[0].id, scheduledFor: nueva });
  assert.equal(updated?.scheduledFor.toISOString(), nueva.toISOString());
  assert.equal(
    (await prisma.automationJob.count({
      where: { tenantId, status: { in: ["SCHEDULED", "PENDING", "RETRY_PENDING"] } },
    })),
    1
  );
});

test("archivar una regla cancela sus envíos pendientes", async () => {
  const tenantId = await createTenant("archive");
  const rule = await createRule(tenantId, {
    name: "A archivar",
    eventType: "CUSTOMER_CREATED",
    status: "ACTIVE",
    actionType: "SEND_WHATSAPP_MESSAGE",
    actionConfig: { template: "Bienvenido a {{negocio}}." },
    scheduleStrategy: "DELAY",
    delayMinutes: 60,
  } as never);

  await emitAutomationEventOrThrow({
    tenantId,
    type: "CUSTOMER_CREATED",
    source: "test",
    entityType: "CUSTOMER",
    entityId: "cus_archive_1",
  });

  const result = await archiveRule(tenantId, rule.id);
  assert.equal(result.cancelledJobs, 1);
  assert.equal((await listJobs(tenantId, { status: "CANCELLED" })).total, 1);
});

// ─── Concurrencia del worker ─────────────────────────────────────────────────

test("concurrencia: dos workers no pueden reclamar el mismo job", async () => {
  const tenantId = await createTenant("concurrency");
  await createImmediateRule(tenantId);

  // 6 jobs vencidos (uno por entidad distinta)
  for (let i = 0; i < 6; i += 1) {
    await emitAutomationEventOrThrow({
      tenantId,
      type: "APPOINTMENT_COMPLETED",
      source: "test",
      entityType: "APPOINTMENT",
      entityId: `appt_conc_${i}`,
    });
  }

  const [workerA, workerB] = await Promise.all([
    claimDueJobs({ workerId: "worker-A", batchSize: 10 }),
    claimDueJobs({ workerId: "worker-B", batchSize: 10 }),
  ]);

  const idsA = new Set(workerA.filter((j) => j.tenantId === tenantId).map((j) => j.id));
  const idsB = new Set(workerB.filter((j) => j.tenantId === tenantId).map((j) => j.id));
  const shared = [...idsA].filter((id) => idsB.has(id));

  assert.equal(shared.length, 0, "ningún job puede ser reclamado por los dos workers");
  assert.equal(idsA.size + idsB.size, 6, "entre ambos deben reclamar los 6 jobs, sin repetir");

  // El claim marca PROCESSING y consume un intento
  const claimed = await prisma.automationJob.findMany({ where: { tenantId } });
  assert.ok(claimed.every((j) => j.status === "PROCESSING" && j.attemptCount === 1));
  assert.ok(claimed.every((j) => j.lockedBy === "worker-A" || j.lockedBy === "worker-B"));
});

test("recuperación: un job con lease vencido vuelve a la cola", async () => {
  const tenantId = await createTenant("stale");
  await createImmediateRule(tenantId);
  await emitAutomationEventOrThrow({
    tenantId,
    type: "APPOINTMENT_COMPLETED",
    source: "test",
    entityType: "APPOINTMENT",
    entityId: "appt_stale_1",
  });

  const [job] = await claimDueJobs({ workerId: "worker-muerto", batchSize: 5 });
  assert.ok(job);

  // Simula que el worker murió hace 10 minutos
  await prisma.automationJob.update({
    where: { id: job.id },
    data: { lockedAt: new Date(Date.now() - 10 * 60 * 1000) },
  });

  await recoverStaleJobs({ leaseMs: 5 * 60 * 1000 });

  const recovered = await prisma.automationJob.findUnique({ where: { id: job.id } });
  assert.equal(recovered?.status, "RETRY_PENDING");
  assert.equal(recovered?.lockedBy, null);
  assert.equal(recovered?.lastErrorCode, "WORKER_LEASE_EXPIRED");
});

// ─── Retries ─────────────────────────────────────────────────────────────────

test("retry: un fallo reintentable programa el próximo intento; uno definitivo marca FAILED", async () => {
  const tenantId = await createTenant("retry");
  const rule = await createImmediateRule(tenantId);
  await emitAutomationEventOrThrow({
    tenantId,
    type: "APPOINTMENT_COMPLETED",
    source: "test",
    entityType: "APPOINTMENT",
    entityId: "appt_retry_1",
  });

  const [job] = await claimDueJobs({ workerId: "worker-retry", batchSize: 5 });

  const retry = await failJobAttempt({
    tenantId,
    jobId: job.id,
    ruleId: rule.id,
    attemptNumber: 1,
    maxAttempts: 3,
    startedAt: new Date(),
    errorType: "HTTP_503",
    errorMessage: "Error del proveedor (503).",
    retryable: true,
  });

  assert.equal(retry.retryScheduled, true);
  const afterRetry = await prisma.automationJob.findUnique({ where: { id: job.id } });
  assert.equal(afterRetry?.status, "RETRY_PENDING");
  assert.ok((afterRetry?.scheduledFor.getTime() ?? 0) > Date.now(), "el retry va al futuro");

  const permanent = await failJobAttempt({
    tenantId,
    jobId: job.id,
    ruleId: rule.id,
    attemptNumber: 2,
    maxAttempts: 3,
    startedAt: new Date(),
    errorType: "WHATSAPP_NOT_CONNECTED",
    errorMessage: "La integración de WhatsApp no está conectada",
    retryable: false,
  });

  assert.equal(permanent.retryScheduled, false);
  const failed = await prisma.automationJob.findUnique({ where: { id: job.id } });
  assert.equal(failed?.status, "FAILED");

  // Historial auditable de ambos intentos
  const executions = await listExecutions(tenantId, { jobId: job.id });
  assert.equal(executions.total, 2);
  assert.deepEqual(
    executions.items.map((e) => e.status).sort(),
    ["FAILED", "RETRY_SCHEDULED"]
  );
});

test("retry: se agotan los intentos y el job queda FAILED con su error saneado", async () => {
  const tenantId = await createTenant("retry-max");
  const rule = await createImmediateRule(tenantId);
  await emitAutomationEventOrThrow({
    tenantId,
    type: "APPOINTMENT_COMPLETED",
    source: "test",
    entityType: "APPOINTMENT",
    entityId: "appt_retry_2",
  });
  const [job] = await claimDueJobs({ workerId: "worker-max", batchSize: 5 });

  const result = await failJobAttempt({
    tenantId,
    jobId: job.id,
    ruleId: rule.id,
    attemptNumber: 3,
    maxAttempts: 3,
    startedAt: new Date(),
    errorType: "HTTP_500",
    errorMessage: "Error del proveedor (500).",
    retryable: true,
  });

  assert.equal(result.retryScheduled, false);
  const failed = await prisma.automationJob.findUnique({ where: { id: job.id } });
  assert.equal(failed?.status, "FAILED");
  assert.ok(!/Bearer/i.test(failed?.lastError ?? ""));
});

// ─── Ejecución real por el worker ────────────────────────────────────────────

test("worker: una regla desactivada cierra el job como omitido (sin enviar nada)", async () => {
  const tenantId = await createTenant("disabled-rule");
  const rule = await createImmediateRule(tenantId);
  await emitAutomationEventOrThrow({
    tenantId,
    type: "APPOINTMENT_COMPLETED",
    source: "test",
    entityType: "APPOINTMENT",
    entityId: "appt_disabled_1",
  });

  await updateRule(tenantId, rule.id, { enabled: false });

  const [job] = await claimDueJobs({ workerId: "worker-skip", batchSize: 5 });
  const outcome = await runClaimedJob(job);

  assert.equal(outcome, "COMPLETED");
  const executions = await listExecutions(tenantId, { jobId: job.id });
  assert.equal(executions.items[0].status, "SKIPPED");
});

test("worker: sin agente de WhatsApp el job falla como NO reintentable", async () => {
  const tenantId = await createTenant("no-agent");
  await createImmediateRule(tenantId);
  const customer = await createCustomer(tenantId, `+1801${Date.now() % 10_000_000}`);

  await emitAutomationEventOrThrow({
    tenantId,
    type: "APPOINTMENT_COMPLETED",
    source: "test",
    entityType: "APPOINTMENT",
    entityId: "appt_no_agent_1",
    customerId: customer.id,
  });

  const [job] = await claimDueJobs({ workerId: "worker-noagent", batchSize: 5 });
  const outcome = await runClaimedJob(job);

  assert.equal(outcome, "FAILED");
  const failed = await prisma.automationJob.findUnique({ where: { id: job.id } });
  assert.equal(failed?.status, "FAILED");
  assert.equal(failed?.lastErrorCode, "NO_WHATSAPP_AGENT");
});

test("completeJob deja el mensaje programado como enviado y registra la ejecución", async () => {
  const tenantId = await createTenant("outbox");
  const rule = await createImmediateRule(tenantId);
  const customer = await createCustomer(tenantId, `+1802${Date.now() % 10_000_000}`);

  await emitAutomationEventOrThrow({
    tenantId,
    type: "APPOINTMENT_COMPLETED",
    source: "test",
    entityType: "APPOINTMENT",
    entityId: "appt_outbox_1",
    customerId: customer.id,
  });

  const [job] = await claimDueJobs({ workerId: "worker-outbox", batchSize: 5 });
  await completeJob({
    tenantId,
    jobId: job.id,
    ruleId: rule.id,
    summary: "WhatsApp enviado",
    startedAt: new Date(),
    attemptNumber: 1,
  });

  const outbox = await prisma.scheduledMessage.findFirst({
    where: { tenantId, automationJobId: job.id },
  });
  assert.equal(outbox?.status, "SENT");
  assert.ok(outbox?.sentAt);

  const executions = await listExecutions(tenantId, { jobId: job.id });
  assert.equal(executions.items[0].status, "SUCCESS");
});

// ─── WhatsApp: nunca el token de otro tenant ─────────────────────────────────

test("WhatsApp: si el número pertenece a otro tenant, el envío se bloquea", async () => {
  const tenantA = await createTenant("wa-a");
  const tenantB = await createTenant("wa-b");
  const phoneNumberId = `test-phone-${randomUUID().slice(0, 8)}`;

  // El número (y su token) son del tenant B...
  await prisma.whatsAppIntegration.create({
    data: {
      tenantId: tenantB,
      status: "CONNECTED",
      phoneNumberId,
      verifyToken: `verify-${randomUUID()}`,
      displayPhoneNumber: "+18095550000",
    },
  });

  // ...pero un agente del tenant A lo tiene asignado (dato corrupto/bug).
  const agent = await prisma.agent.create({
    data: {
      tenantId: tenantA,
      name: "Agente A",
      status: "ACTIVE",
      whatsappPhoneNumberId: phoneNumberId,
    },
  });

  const customer = await createCustomer(tenantA, `+1803${Date.now() % 10_000_000}`);
  const rule = await createImmediateRule(tenantA);

  await emitAutomationEventOrThrow({
    tenantId: tenantA,
    type: "APPOINTMENT_COMPLETED",
    source: "test",
    entityType: "APPOINTMENT",
    entityId: "appt_wa_1",
    customerId: customer.id,
    payload: { agentId: agent.id },
  });

  const [job] = await claimDueJobs({ workerId: "worker-wa", batchSize: 5 });
  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { id: tenantA },
    select: { id: true, name: true, timezone: true, status: true },
  });
  const ruleRow = await prisma.automationRule.findUniqueOrThrow({ where: { id: rule.id } });

  await assert.rejects(
    () =>
      whatsappMessageExecutor.execute({
        job,
        rule: ruleRow,
        tenant,
        payload: (job.payloadJson ?? {}) as Record<string, unknown>,
        actionConfig: (ruleRow.actionConfigJson ?? {}) as Record<string, unknown>,
        correlationId: null,
      }),
    (error: unknown) => {
      assert.ok(error instanceof AutomationActionError);
      assert.equal(error.errorType, "CROSS_TENANT_INTEGRATION");
      assert.equal(error.kind, "NON_RETRYABLE");
      return true;
    }
  );

  // Y no se registró ningún mensaje saliente en la conversación.
  const outbound = await prisma.message.count({
    where: { tenantId: tenantA, direction: "OUTBOUND" },
  });
  assert.equal(outbound, 0);
});

// ─── Tenants no operativos ───────────────────────────────────────────────────

test("un tenant suspendido no genera automatizaciones", async () => {
  const tenantId = await createTenant("suspended");
  await createImmediateRule(tenantId);
  await prisma.tenant.update({ where: { id: tenantId }, data: { status: "SUSPENDED" } });

  const result = await emitAutomationEventOrThrow({
    tenantId,
    type: "APPOINTMENT_COMPLETED",
    source: "test",
    entityId: "appt_susp_1",
  });

  assert.equal(result.processed, false);
  assert.equal(result.reason, "TENANT_INACTIVE");
  assert.equal(await prisma.automationJob.count({ where: { tenantId } }), 0);
});
