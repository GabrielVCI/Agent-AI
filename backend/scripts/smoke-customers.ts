/**
 * Smoke E2E del Maestro de Clientes (Módulo 1) contra el backend EN MARCHA.
 *
 * Comprueba el contrato HTTP real (no los servicios): códigos de estado,
 * sobre { success, data }, validaciones, aislamiento entre empresas, subida
 * multipart y descarga de la plantilla.
 *
 * Ejecutar con el backend levantado:
 *   npm run smoke:customers
 *   SMOKE_BASE_URL=https://staging.example.com npm run smoke:customers
 *
 * Crea un tenant + OWNER + sesión PROPIOS (prefijo `__smoke__`) y los BORRA al
 * terminar. No lee, modifica ni borra nada preexistente.
 */
import "dotenv/config";
import { randomBytes, createHash, randomUUID } from "crypto";
import { prisma } from "../src/config/prisma.js";
import { closeRedis } from "../src/config/redis.js";

const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:3002";
const COOKIE_NAME = process.env.SESSION_COOKIE_NAME ?? "sid";

let ok = 0;
let failed = 0;

function check(label: string, condition: boolean, extra = "") {
  if (condition) {
    ok++;
    console.log(`  ✔ ${label}`);
  } else {
    failed++;
    console.log(`  ✖ ${label} ${extra}`);
  }
}

async function main() {
  const suffix = randomUUID().slice(0, 8);
  const tenant = await prisma.tenant.create({
    data: { name: `__smoke__${suffix}`, timezone: "America/Santo_Domingo", status: "ACTIVE" },
  });
  const otherTenant = await prisma.tenant.create({
    data: { name: `__smoke_other__${suffix}`, timezone: "America/Santo_Domingo", status: "ACTIVE" },
  });

  try {
    const user = await prisma.user.create({
      data: {
        tenantId: tenant.id,
        name: "Smoke",
        lastName: "Owner",
        email: `smoke-${suffix}@example.test`,
        role: "OWNER",
        status: "ACTIVE",
        emailVerifiedAt: new Date(),
      },
    });

    const token = randomBytes(32).toString("hex");
    await prisma.session.create({
      data: {
        userId: user.id,
        sessionTokenHash: createHash("sha256").update(token).digest("hex"),
        expiresAt: new Date(Date.now() + 3600_000),
      },
    });

    const headers = { cookie: `${COOKIE_NAME}=${token}`, "content-type": "application/json" };
    const call = async (path: string, init: RequestInit = {}) => {
      const res = await fetch(`${BASE}${path}`, { ...init, headers: { ...headers, ...init.headers } });
      const text = await res.text();
      let body: unknown = null;
      try {
        body = JSON.parse(text);
      } catch {
        body = text.slice(0, 120);
      }
      return { status: res.status, body: body as Record<string, unknown> };
    };

    console.log("\n─── Smoke HTTP del Maestro de Clientes ───\n");

    // Listado vacío
    const empty = await call("/api/customers");
    check("GET /api/customers responde 200", empty.status === 200, String(empty.status));
    const emptyData = empty.body?.data as { items?: unknown[]; total?: number; pages?: number };
    check("contrato paginado { items, total, page, limit, pages }",
      Array.isArray(emptyData?.items) && emptyData?.total === 0 && typeof emptyData?.pages === "number");

    // Alta manual
    const created = await call("/api/customers", {
      method: "POST",
      body: JSON.stringify({
        firstName: "Gabriela",
        lastName: "Pérez",
        phone: "809-555-9001",
        email: "gabriela.smoke@ejemplo.com",
        documentId: "001-1234567-8",
        notes: "Nota interna",
      }),
    });
    check("POST /api/customers crea (201)", created.status === 201, String(created.status));
    const customer = created.body?.data as { id: string; name: string; phoneNormalized: string; documentId: string };
    check("teléfono normalizado a E.164", customer?.phoneNormalized === "+18095559001", customer?.phoneNormalized);
    check("nombre compuesto", customer?.name === "Gabriela Pérez", customer?.name);

    // Validación
    const badPhone = await call("/api/customers", {
      method: "POST",
      body: JSON.stringify({ firstName: "Mal", lastName: "Telefono", phone: "123" }),
    });
    check("teléfono inválido → 400 con mensaje amigable",
      badPhone.status === 400 && typeof badPhone.body?.message === "string", String(badPhone.status));

    const blankName = await call("/api/customers", {
      method: "POST",
      body: JSON.stringify({ firstName: "   ", lastName: "Pérez", phone: "8095559002" }),
    });
    check("nombre en blanco → 400", blankName.status === 400, String(blankName.status));

    // Duplicado en otro formato → 409 con el id existente
    const dupe = await call("/api/customers", {
      method: "POST",
      body: JSON.stringify({ firstName: "Gabriela", lastName: "Pérez", phone: "+1 (809) 555-9001" }),
    });
    const dupeError = dupe.body?.error as { code?: string; details?: { customerId?: string } };
    check("duplicado → 409 (no 500)", dupe.status === 409, String(dupe.status));
    check("el 409 trae el id del cliente existente",
      dupeError?.details?.customerId === customer?.id, JSON.stringify(dupeError?.details));

    // Listado: el DTO no filtra PII
    const listed = await call("/api/customers");
    const first = (listed.body?.data as { items: Record<string, unknown>[] }).items[0];
    check("el listado NO expone cédula/dirección/notas",
      !("documentId" in first) && !("address" in first) && !("notes" in first));

    // Búsqueda tolerante al formato
    const search = await call("/api/customers?search=8095559001");
    check("búsqueda por teléfono sin formato encuentra el canónico",
      (search.body?.data as { total: number }).total === 1);

    // Ficha, resumen y timeline
    const profile = await call(`/api/customers/${customer.id}`);
    check("GET /:id devuelve la ficha con la cédula", profile.status === 200 &&
      (profile.body?.data as { documentId: string }).documentId === "001-1234567-8");

    const summary = await call(`/api/customers/${customer.id}/summary`);
    check("GET /:id/summary responde 200", summary.status === 200);
    const summaryData = summary.body?.data as { visitCount: number; quotes: { totalQuoted: number } };
    check("métricas reales en cero (sin datos inventados)",
      summaryData?.visitCount === 0 && summaryData?.quotes?.totalQuoted === 0);

    const timeline = await call(`/api/customers/${customer.id}/timeline`);
    check("GET /:id/timeline responde paginado", timeline.status === 200 &&
      Array.isArray((timeline.body?.data as { items: unknown[] }).items));

    // Edición
    const updated = await call(`/api/customers/${customer.id}`, {
      method: "PATCH",
      body: JSON.stringify({ isVip: true, tags: ["VIP", "Recurrente"] }),
    });
    check("PATCH /:id marca VIP y etiquetas", updated.status === 200 &&
      (updated.body?.data as { isVip: boolean }).isVip === true);

    const tags = await call("/api/customers/tags");
    check("GET /tags devuelve las etiquetas en uso",
      JSON.stringify((tags.body?.data as string[])?.sort()) === JSON.stringify(["Recurrente", "VIP"]));

    // Aislamiento entre empresas
    const alien = await prisma.customer.create({
      data: { tenantId: otherTenant.id, phone: "+18095559999", name: "Ajeno" },
    });
    const crossRead = await call(`/api/customers/${alien.id}`);
    check("cliente de otra empresa → 404 (no 403 ni 200)", crossRead.status === 404, String(crossRead.status));
    const crossPatch = await call(`/api/customers/${alien.id}`, {
      method: "PATCH",
      body: JSON.stringify({ firstName: "Hackeado" }),
    });
    check("PATCH cross-tenant → 404", crossPatch.status === 404, String(crossPatch.status));
    const crossSummary = await call(`/api/customers/${alien.id}/summary`);
    check("summary cross-tenant → 404", crossSummary.status === 404, String(crossSummary.status));

    // Plantilla de importación
    const template = await fetch(`${BASE}/api/customers/import/template`, { headers });
    const templateBuffer = Buffer.from(await template.arrayBuffer());
    check("plantilla .xlsx descargable", template.status === 200 &&
      templateBuffer[0] === 0x50 && templateBuffer[1] === 0x4b, String(template.status));

    // Importación real (multipart)
    const csv = [
      "Nombre,Apellido,Teléfono,Email",
      "Ana,Torres,8095559010,ana.smoke@ejemplo.com",
      "Luis,Peña,(809) 555-9011,",
      "Mal,Telefono,123,",
    ].join("\n");
    const form = new FormData();
    form.append("file", new Blob([csv], { type: "text/csv" }), "clientes.csv");

    const previewRes = await fetch(`${BASE}/api/customers/import/preview`, {
      method: "POST",
      headers: { cookie: `${COOKIE_NAME}=${token}` },
      body: form,
    });
    const preview = (await previewRes.json()) as { data: { processed: number; valid: number; invalid: number; created: number } };
    check("preview de import valida sin escribir",
      previewRes.status === 200 && preview.data.processed === 3 && preview.data.invalid === 1 && preview.data.created === 0,
      JSON.stringify(preview.data));

    const form2 = new FormData();
    form2.append("file", new Blob([csv], { type: "text/csv" }), "clientes.csv");
    const importRes = await fetch(`${BASE}/api/customers/import`, {
      method: "POST",
      headers: { cookie: `${COOKIE_NAME}=${token}` },
      body: form2,
    });
    const imported = (await importRes.json()) as { data: { created: number; invalid: number } };
    check("import real crea 2 y reporta 1 con error",
      importRes.status === 200 && imported.data.created === 2 && imported.data.invalid === 1,
      JSON.stringify(imported.data));

    // Contadores
    const counters = await call("/api/customers/counters");
    check("GET /counters cuadra con lo creado",
      (counters.body?.data as { total: number }).total === 3,
      JSON.stringify(counters.body?.data));

    // Archivar
    const archived = await call(`/api/customers/${customer.id}/archive`, {
      method: "PATCH",
      body: JSON.stringify({ archived: true }),
    });
    check("PATCH /:id/archive archiva (sin borrado físico)",
      archived.status === 200 && (archived.body?.data as { stage: string }).stage === "ARCHIVED");
    const afterArchive = await call("/api/customers");
    check("el archivado sale del listado por defecto",
      (afterArchive.body?.data as { total: number }).total === 2);
    check("sigue existiendo en la base de datos",
      (await prisma.customer.count({ where: { id: customer.id } })) === 1);

    console.log(`\n─── Resultado: ${ok} OK · ${failed} fallos ───\n`);
  } finally {
    await prisma.tenant.delete({ where: { id: tenant.id } }).catch(() => {});
    await prisma.tenant.delete({ where: { id: otherTenant.id } }).catch(() => {});
    await prisma.$disconnect();
    await closeRedis().catch(() => {});
  }

  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (error) => {
  console.error("Smoke falló:", error);
  await prisma.$disconnect();
  await closeRedis().catch(() => {});
  process.exit(1);
});
