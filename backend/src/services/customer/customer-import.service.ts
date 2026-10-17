/**
 * Importación por lote del Maestro de Clientes (CSV y Excel .xlsx).
 *
 * Reutiliza la infraestructura que ya existe para las citas: multer en memoria
 * (el archivo NUNCA toca disco), exceljs para .xlsx y el mismo contrato de
 * resultado por fila con fase de preview. No se crea un segundo sistema de
 * subida.
 *
 * Garantías:
 *  · Idempotencia: la clave de deduplicación es (tenantId, teléfono E.164).
 *    Importar dos veces el mismo archivo NO crea duplicados.
 *  · Duplicados DENTRO del archivo: "809-555-5555" en la fila 4 y
 *    "+1 809 555 5555" en la 91 se detectan como el mismo teléfono.
 *  · Tolerancia a errores: una fila inválida no aborta las otras 349.
 *  · Lotes: la inserción va en tandas; nunca una transacción gigante que
 *    bloquee la tabla mientras se procesan miles de filas.
 */
import ExcelJS from "exceljs";
import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma.js";
import { logger } from "../../config/logger.js";
import { AppError } from "../../errors/AppError.js";
import { emitAutomationEvent } from "../automation/automation-events.service.js";
import { invalidateDashboardCache } from "../dashboard.service.js";
import { normalizePhone } from "../../utils/phone.js";
import { composeName, displayName } from "./customer-names.js";
import { getTenantPhoneCountry } from "./customer.service.js";

/** Tope de filas por archivo. Por encima, el negocio parte el archivo. */
export const MAX_IMPORT_ROWS = 5000;
/** Tamaño de lote de inserción: suficiente para ir rápido sin locks largos. */
const BATCH_SIZE = 100;

// ─── Contrato de columnas ────────────────────────────────────────────────────

/**
 * Encabezados aceptados. El primero es el oficial de la plantilla (español) y
 * el resto son alias tolerados (inglés y variantes sin tilde) para que un
 * export de otro CRM entre sin editar el archivo a mano.
 */
const COLUMNS = [
  { key: "firstName", header: "Nombre", aliases: ["firstname", "first name", "nombres"] },
  { key: "lastName", header: "Apellido", aliases: ["lastname", "last name", "apellidos"] },
  { key: "phone", header: "Teléfono", aliases: ["telefono", "phone", "whatsapp", "celular", "movil", "móvil"] },
  { key: "email", header: "Email", aliases: ["correo", "e-mail", "correo electronico", "correo electrónico"] },
  { key: "birthDate", header: "Fecha de nacimiento", aliases: ["birthdate", "nacimiento", "cumpleanos", "cumpleaños", "fecha nacimiento"] },
  { key: "documentId", header: "Cédula", aliases: ["cedula", "documentid", "documento", "dni", "identificacion", "identificación"] },
  { key: "address", header: "Dirección", aliases: ["direccion", "address"] },
  { key: "notes", header: "Notas", aliases: ["notas", "notes", "observaciones"] },
  { key: "tags", header: "Etiquetas", aliases: ["etiquetas", "tags", "categoria", "categoría", "segmento"] },
] as const;

type ColumnKey = (typeof COLUMNS)[number]["key"];

const REQUIRED_HEADERS: ColumnKey[] = ["firstName", "lastName", "phone"];

/** Normaliza un encabezado para comparar: minúsculas, sin tildes ni espacios. */
function headerKey(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ");
}

function resolveColumnKey(header: string): ColumnKey | null {
  const normalized = headerKey(header);
  for (const column of COLUMNS) {
    if (headerKey(column.header) === normalized) return column.key;
    if (column.aliases.some((alias) => headerKey(alias) === normalized)) return column.key;
  }
  return null;
}

// ─── Resultado ───────────────────────────────────────────────────────────────

export interface CustomerImportRowResult {
  /** Fila del archivo tal como la ve el usuario (1 = encabezado). */
  row: number;
  name: string;
  phone: string;
  errors: string[];
  /** Ya existía en el maestro (o repetido en el archivo). */
  duplicate: boolean;
  duplicateReason: "EXISTING" | "IN_FILE" | null;
  /** Id del cliente existente, para abrir su ficha desde el resultado. */
  existingCustomerId: string | null;
  created: boolean;
}

export interface CustomerImportResult {
  preview: boolean;
  fileName: string;
  processed: number;
  valid: number;
  invalid: number;
  existing: number;
  duplicatesInFile: number;
  created: number;
  rows: CustomerImportRowResult[];
  truncated: boolean;
}

interface ParsedRow {
  row: number;
  values: Partial<Record<ColumnKey, string>>;
}

interface ValidRow {
  row: number;
  firstName: string;
  lastName: string;
  phoneE164: string;
  phoneCountry: string | null;
  email: string | null;
  birthDate: Date | null;
  documentId: string | null;
  address: string | null;
  notes: string | null;
  tags: string[];
}

// ─── Lectura del archivo ─────────────────────────────────────────────────────

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const ACCEPTED_MIMES = new Set([
  XLSX_MIME,
  "application/vnd.ms-excel",
  "text/csv",
  "application/csv",
  "text/plain",
  "application/octet-stream", // navegadores que no reconocen la extensión
]);

/**
 * Decide el formato y valida el archivo ANTES de parsearlo.
 * No se confía solo en la extensión: se comprueba también la firma binaria
 * (un .xlsx es un ZIP y empieza por "PK").
 */
function detectFormat(file: { originalname: string; mimetype?: string; buffer: Buffer }): "xlsx" | "csv" {
  const name = file.originalname.toLowerCase();
  const extension = name.slice(name.lastIndexOf("."));

  if (![".csv", ".xlsx"].includes(extension)) {
    throw new AppError("Solo aceptamos archivos .csv o .xlsx", 400, { code: "VALIDATION_ERROR" });
  }
  if (file.mimetype && !ACCEPTED_MIMES.has(file.mimetype)) {
    throw new AppError("El tipo de archivo no es compatible. Usa .csv o .xlsx", 400, {
      code: "VALIDATION_ERROR",
    });
  }
  if (!file.buffer?.length) {
    throw new AppError("El archivo está vacío", 400, { code: "VALIDATION_ERROR" });
  }

  const isZip = file.buffer.length > 2 && file.buffer[0] === 0x50 && file.buffer[1] === 0x4b;
  if (extension === ".xlsx") {
    if (!isZip) {
      throw new AppError("El archivo no es un .xlsx válido (parece dañado)", 400, {
        code: "VALIDATION_ERROR",
      });
    }
    return "xlsx";
  }
  // .xlsx renombrado a .csv: se detecta y se rechaza en vez de leer binario.
  if (isZip) {
    throw new AppError("Ese archivo es un Excel con extensión .csv. Renómbralo a .xlsx", 400, {
      code: "VALIDATION_ERROR",
    });
  }
  return "csv";
}

/** Texto plano de una celda de exceljs. Las fórmulas se leen por su resultado
 *  cacheado; NUNCA se evalúan ni se ejecuta nada del archivo. */
function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) {
    return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}-${String(
      value.getUTCDate()
    ).padStart(2, "0")}`;
  }
  if (typeof value === "object") {
    const v = value as { text?: string; result?: unknown; richText?: { text: string }[]; hyperlink?: string };
    if (Array.isArray(v.richText)) return v.richText.map((r) => r.text).join("").trim();
    if (typeof v.text === "string") return v.text.trim();
    if (v.result !== undefined && v.result !== null) return String(v.result).trim();
    return "";
  }
  return String(value).trim();
}

/**
 * Parser CSV mínimo pero correcto (RFC 4180): comillas dobles, comillas
 * escapadas (""), saltos de línea dentro de comillas, CRLF y BOM. Detecta
 * automáticamente si el separador es coma o punto y coma (Excel en español).
 */
function parseCsv(text: string): string[][] {
  const content = text.replace(/^﻿/, "");
  const firstLine = content.slice(0, content.indexOf("\n") === -1 ? content.length : content.indexOf("\n"));
  const delimiter = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < content.length; i++) {
    const char = content[i];

    if (inQuotes) {
      if (char === '"') {
        if (content[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === delimiter) {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** Lee el archivo a filas crudas (encabezado ya mapeado a claves conocidas). */
function readRows(
  file: { originalname: string; mimetype?: string; buffer: Buffer },
  workbookRows: string[][]
): { rows: ParsedRow[]; truncated: boolean } {
  if (workbookRows.length === 0) return { rows: [], truncated: false };

  const headerRow = workbookRows[0];
  const columnIndex = new Map<ColumnKey, number>();
  headerRow.forEach((header, index) => {
    const key = resolveColumnKey(header);
    if (key && !columnIndex.has(key)) columnIndex.set(key, index);
  });

  const missing = REQUIRED_HEADERS.filter((key) => !columnIndex.has(key));
  if (missing.length > 0) {
    const labels = missing.map((key) => COLUMNS.find((c) => c.key === key)?.header ?? key);
    throw new AppError(
      `Faltan columnas obligatorias: ${labels.join(", ")}. Descarga la plantilla oficial de Sendwary.`,
      400,
      { code: "VALIDATION_ERROR" }
    );
  }

  const dataRows = workbookRows.slice(1);
  const truncated = dataRows.length > MAX_IMPORT_ROWS;
  const rows: ParsedRow[] = [];

  dataRows.slice(0, MAX_IMPORT_ROWS).forEach((cells, index) => {
    const values: Partial<Record<ColumnKey, string>> = {};
    let hasContent = false;
    for (const [key, position] of columnIndex) {
      const text = (cells[position] ?? "").trim();
      if (text) {
        values[key] = text;
        hasContent = true;
      }
    }
    if (hasContent) rows.push({ row: index + 2, values });
  });

  return { rows, truncated };
}

async function fileToRows(file: {
  originalname: string;
  mimetype?: string;
  buffer: Buffer;
}): Promise<string[][]> {
  const format = detectFormat(file);

  if (format === "csv") {
    return parseCsv(file.buffer.toString("utf8"));
  }

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(file.buffer as unknown as ExcelJS.Buffer);
  } catch {
    throw new AppError("No pudimos leer el archivo .xlsx (puede estar dañado)", 400, {
      code: "VALIDATION_ERROR",
    });
  }
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];

  const rows: string[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const cells: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      cells[colNumber - 1] = cellText(cell.value);
    });
    rows.push([...cells].map((c) => c ?? ""));
  });
  return rows;
}

// ─── Validación por fila ─────────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Acepta AAAA-MM-DD, DD/MM/AAAA y DD-MM-AAAA. */
function parseBirthDate(raw: string): { date: Date | null; error: string | null } {
  const text = raw.trim();
  if (!text) return { date: null, error: null };

  let year: number, month: number, day: number;
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(text);
  if (match) {
    [, year, month, day] = match.map(Number) as [number, number, number, number];
  } else {
    match = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(text);
    if (!match) {
      return { date: null, error: "Fecha de nacimiento: usa el formato AAAA-MM-DD o DD/MM/AAAA" };
    }
    day = Number(match[1]);
    month = Number(match[2]);
    year = Number(match[3]);
  }

  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    Number.isNaN(date.getTime()) ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return { date: null, error: "Fecha de nacimiento: esa fecha no existe" };
  }
  if (date.getTime() > Date.now()) {
    return { date: null, error: "Fecha de nacimiento: no puede estar en el futuro" };
  }
  if (year < 1900) return { date: null, error: "Fecha de nacimiento: el año parece incorrecto" };
  return { date, error: null };
}

function validateRow(parsed: ParsedRow, country: string): { valid?: ValidRow; errors: string[] } {
  const errors: string[] = [];
  const v = parsed.values;

  const firstName = (v.firstName ?? "").trim();
  if (firstName.length < 2) errors.push("Nombre: obligatorio (mínimo 2 caracteres)");
  if (firstName.length > 80) errors.push("Nombre: máximo 80 caracteres");

  const lastName = (v.lastName ?? "").trim();
  if (lastName.length < 2) errors.push("Apellido: obligatorio (mínimo 2 caracteres)");
  if (lastName.length > 80) errors.push("Apellido: máximo 80 caracteres");

  const phoneRaw = (v.phone ?? "").trim();
  const phone = normalizePhone(phoneRaw, country);
  if (!phoneRaw) errors.push("Teléfono: obligatorio");
  else if (!phone.valid || !phone.e164) {
    errors.push("Teléfono: no es un número válido (incluye el código de país)");
  }

  const emailRaw = (v.email ?? "").trim().toLowerCase();
  if (emailRaw && !EMAIL_RE.test(emailRaw)) errors.push("Email: formato inválido");

  const birth = parseBirthDate(v.birthDate ?? "");
  if (birth.error) errors.push(birth.error);

  const notes = (v.notes ?? "").trim();
  if (notes.length > 2000) errors.push("Notas: máximo 2000 caracteres");

  const documentId = (v.documentId ?? "").trim();
  if (documentId.length > 40) errors.push("Cédula: máximo 40 caracteres");

  const address = (v.address ?? "").trim();
  if (address.length > 300) errors.push("Dirección: máximo 300 caracteres");

  if (errors.length > 0) return { errors };

  const tags = (v.tags ?? "")
    .split(/[,;|]/)
    .map((t) => t.trim().slice(0, 40))
    .filter(Boolean)
    .slice(0, 20);

  return {
    errors: [],
    valid: {
      row: parsed.row,
      firstName,
      lastName,
      phoneE164: phone.e164 as string,
      phoneCountry: phone.country,
      email: emailRaw || null,
      birthDate: birth.date,
      documentId: documentId || null,
      address: address || null,
      notes: notes || null,
      tags,
    },
  };
}

// ─── Importación ─────────────────────────────────────────────────────────────

/**
 * Procesa el archivo. Con `preview: true` valida, deduplica y reporta SIN
 * escribir nada en la base de datos.
 */
export async function importCustomers(
  tenantId: string,
  file: { originalname: string; mimetype?: string; buffer: Buffer },
  options: { preview: boolean }
): Promise<CustomerImportResult> {
  const country = await getTenantPhoneCountry(tenantId);
  const workbookRows = await fileToRows(file);
  const { rows: parsedRows, truncated } = readRows(file, workbookRows);

  const results: CustomerImportRowResult[] = [];
  const validRows: ValidRow[] = [];

  for (const parsed of parsedRows) {
    const { valid, errors } = validateRow(parsed, country);
    results.push({
      row: parsed.row,
      name: composeName(parsed.values.firstName, parsed.values.lastName, "—"),
      phone: (parsed.values.phone ?? "").trim(),
      errors,
      duplicate: false,
      duplicateReason: null,
      existingCustomerId: null,
      created: false,
    });
    if (valid) validRows.push(valid);
  }

  const resultByRow = new Map(results.map((r) => [r.row, r]));

  // ── Duplicados dentro del archivo (por teléfono canónico) ──
  const seenInFile = new Map<string, number>();
  const candidates: ValidRow[] = [];
  for (const row of validRows) {
    const firstSeen = seenInFile.get(row.phoneE164);
    const result = resultByRow.get(row.row);
    if (firstSeen !== undefined) {
      if (result) {
        result.duplicate = true;
        result.duplicateReason = "IN_FILE";
        result.errors.push(`Teléfono repetido en el archivo (ya aparece en la fila ${firstSeen})`);
      }
      continue;
    }
    seenInFile.set(row.phoneE164, row.row);
    candidates.push(row);
  }

  // ── Duplicados contra el maestro (idempotencia del re-import) ──
  const existingByPhone = new Map<string, { id: string }>();
  for (let i = 0; i < candidates.length; i += 500) {
    const chunk = candidates.slice(i, i + 500);
    const found = await prisma.customer.findMany({
      where: { tenantId, phoneNormalized: { in: chunk.map((c) => c.phoneE164) } },
      select: { id: true, phoneNormalized: true },
    });
    for (const customer of found) {
      if (customer.phoneNormalized) existingByPhone.set(customer.phoneNormalized, { id: customer.id });
    }
  }

  const toCreate: ValidRow[] = [];
  for (const row of candidates) {
    const existing = existingByPhone.get(row.phoneE164);
    const result = resultByRow.get(row.row);
    if (existing) {
      if (result) {
        result.duplicate = true;
        result.duplicateReason = "EXISTING";
        result.existingCustomerId = existing.id;
      }
      continue;
    }
    toCreate.push(row);
  }

  // ── Inserción por lotes ──
  let created = 0;
  if (!options.preview && toCreate.length > 0) {
    for (let i = 0; i < toCreate.length; i += BATCH_SIZE) {
      const batch = toCreate.slice(i, i + BATCH_SIZE);
      const inserted = await insertBatch(tenantId, batch, resultByRow);
      created += inserted;
    }
    void invalidateDashboardCache(tenantId);
    logger.info(
      `[CUSTOMER IMPORT] tenant=${tenantId} archivo=${file.originalname} creados=${created} existentes=${existingByPhone.size}`
    );
  }

  return {
    preview: options.preview,
    fileName: file.originalname,
    processed: results.length,
    valid: candidates.length,
    invalid: results.filter((r) => r.errors.length > 0 && r.duplicateReason !== "IN_FILE").length,
    existing: results.filter((r) => r.duplicateReason === "EXISTING").length,
    duplicatesInFile: results.filter((r) => r.duplicateReason === "IN_FILE").length,
    created,
    rows: results,
    truncated,
  };
}

/**
 * Inserta un lote. Si el lote entero falla (típicamente porque otro proceso
 * creó uno de esos teléfonos entre la comprobación y el insert), se reintenta
 * fila a fila: NO se pierden 99 clientes buenos por 1 conflictivo.
 */
async function insertBatch(
  tenantId: string,
  batch: ValidRow[],
  resultByRow: Map<number, CustomerImportRowResult>
): Promise<number> {
  const dataFor = (row: ValidRow) => ({
    tenantId,
    firstName: row.firstName,
    lastName: row.lastName,
    name: composeName(row.firstName, row.lastName),
    phone: row.phoneE164,
    phoneNormalized: row.phoneE164,
    phoneCountry: row.phoneCountry,
    email: row.email,
    birthDate: row.birthDate,
    documentId: row.documentId,
    address: row.address,
    notes: row.notes,
    tags: row.tags,
    stage: "CLIENT" as const,
    source: "IMPORT" as const,
    clientSince: new Date(),
  });

  const createdRows: { id: string; row: number; name: string; phone: string }[] = [];

  try {
    const inserted = await prisma.$transaction(
      batch.map((row) =>
        prisma.customer.create({
          data: dataFor(row),
          select: { id: true, name: true, firstName: true, lastName: true, phoneNormalized: true },
        })
      )
    );
    inserted.forEach((customer, index) => {
      createdRows.push({
        id: customer.id,
        row: batch[index].row,
        name: displayName({ ...customer, name: customer.name ?? null }),
        phone: customer.phoneNormalized ?? batch[index].phoneE164,
      });
    });
  } catch {
    // Reintento individual: el lote se descarta entero por diseño de Postgres,
    // así que se recupera fila a fila.
    for (const row of batch) {
      try {
        const customer = await prisma.customer.create({
          data: dataFor(row),
          select: { id: true, name: true, firstName: true, lastName: true, phoneNormalized: true },
        });
        createdRows.push({
          id: customer.id,
          row: row.row,
          name: displayName({ ...customer, name: customer.name ?? null }),
          phone: customer.phoneNormalized ?? row.phoneE164,
        });
      } catch (error) {
        const result = resultByRow.get(row.row);
        if (!result) continue;
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          const existing = await prisma.customer.findUnique({
            where: { tenantId_phoneNormalized: { tenantId, phoneNormalized: row.phoneE164 } },
            select: { id: true },
          });
          result.duplicate = true;
          result.duplicateReason = "EXISTING";
          result.existingCustomerId = existing?.id ?? null;
        } else {
          result.errors.push("No se pudo guardar esta fila. Revisa los datos e inténtalo de nuevo.");
          logger.warn(
            `[CUSTOMER IMPORT] fila ${row.row} falló tenant=${tenantId}: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        }
      }
    }
  }

  // Eventos del motor FUERA de la transacción: una automatización lenta o mal
  // configurada no puede alargar un lock de base de datos.
  for (const customer of createdRows) {
    const result = resultByRow.get(customer.row);
    if (result) result.created = true;
    await emitAutomationEvent({
      tenantId,
      type: "CUSTOMER_CREATED",
      source: "customers.import",
      entityType: "CUSTOMER",
      entityId: customer.id,
      customerId: customer.id,
      payload: { customerName: customer.name, phone: customer.phone, source: "IMPORT" },
      idempotencyKey: `customer-created:${customer.id}`,
    });
  }

  return createdRows.length;
}

// ─── Plantilla ───────────────────────────────────────────────────────────────

/** Plantilla .xlsx con las columnas oficiales, un ejemplo y las reglas. */
export async function buildCustomersTemplate(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Sendwary";

  const sheet = workbook.addWorksheet("Clientes");
  sheet.columns = COLUMNS.map((c) => ({
    header: c.header,
    key: c.key,
    width: c.key === "notes" || c.key === "address" ? 34 : 22,
  }));

  sheet.addRow({
    firstName: "Gabriela",
    lastName: "Pérez",
    phone: "+18095551234",
    email: "gabriela@ejemplo.com",
    birthDate: "1992-04-18",
    documentId: "001-1234567-8",
    address: "Av. Winston Churchill 1, Santo Domingo",
    notes: "Fila de ejemplo: bórrala antes de importar",
    tags: "VIP, Recurrente",
  });

  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF6D28D9" } };
  header.height = 20;

  const help = workbook.addWorksheet("Instrucciones");
  help.columns = [{ width: 26 }, { width: 78 }];
  const lines: [string, string][] = [
    ["Campo", "Reglas"],
    ["Nombre", "Obligatorio. Mínimo 2 caracteres."],
    ["Apellido", "Obligatorio. Mínimo 2 caracteres."],
    ["Teléfono", "Obligatorio. Con código de país (+1 809 555 5555). Aceptamos guiones, espacios y paréntesis."],
    ["Email", "Opcional. Debe ser un correo válido."],
    ["Fecha de nacimiento", "Opcional. AAAA-MM-DD o DD/MM/AAAA. No puede ser futura."],
    ["Cédula", "Opcional. Máximo 40 caracteres."],
    ["Dirección", "Opcional. Máximo 300 caracteres."],
    ["Notas", "Opcional. Máximo 2000 caracteres."],
    ["Etiquetas", "Opcional. Separadas por coma (ej: VIP, Recurrente). Máximo 20."],
    ["", ""],
    ["Duplicados", "Un cliente se considera repetido si su teléfono ya existe en tu maestro, en cualquier formato."],
    ["Reimportar", "Puedes subir el mismo archivo dos veces: no se duplica nada."],
    ["Límite", `Máximo ${MAX_IMPORT_ROWS.toLocaleString("es-DO")} filas por archivo.`],
    ["Vista previa", "Revisa el resumen antes de confirmar: te decimos cuántos se crearán y cuáles tienen errores."],
  ];
  for (const line of lines) help.addRow(line);
  help.getRow(1).font = { bold: true };

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
