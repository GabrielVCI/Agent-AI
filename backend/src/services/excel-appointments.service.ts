import ExcelJS from "exceljs";
import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma.js";
import { logger } from "../config/logger.js";
import { AppError } from "../middlewares/error.middleware.js";
import { listAppointments } from "./appointment.service.js";

/**
 * Integración Excel para la agenda de citas (Parte E).
 *
 * Versión local y segura con .xlsx (exceljs): exportar agenda, descargar
 * plantilla e importar con validación por fila, preview (dryRun) y detección
 * de duplicados. Sin credenciales externas.
 *
 * Futuro Microsoft Graph/Excel Online: el modelo `Integration` (type EXCEL,
 * encryptedConfig) ya soporta guardar la configuración de sincronización;
 * este servicio quedaría como capa de lectura/escritura de workbook.
 */

// Columnas del contrato Excel (orden fijo, nombres estables)
const COLUMNS = [
  { key: "customerName", header: "customerName", width: 24 },
  { key: "customerPhone", header: "customerPhone", width: 16 },
  { key: "customerEmail", header: "customerEmail", width: 26 },
  { key: "scheduledDate", header: "scheduledDate", width: 14 },
  { key: "scheduledTime", header: "scheduledTime", width: 12 },
  { key: "serviceOrProduct", header: "serviceOrProduct", width: 28 },
  { key: "status", header: "status", width: 13 },
  { key: "confirmationStatus", header: "confirmationStatus", width: 18 },
  { key: "priority", header: "priority", width: 11 },
  { key: "notes", header: "notes", width: 36 },
] as const;

const VALID_STATUS = ["PENDING", "CONFIRMED", "CANCELLED", "RESCHEDULED", "NO_SHOW", "COMPLETED"] as const;
const VALID_CONFIRMATION = ["UNCONFIRMED", "CONFIRMED", "CANCELLED"] as const;
const VALID_PRIORITY = ["LOW", "NORMAL", "HIGH", "FOLLOW_UP"] as const;

type ImportRowData = {
  customerName: string;
  customerPhone: string;
  customerEmail: string | null;
  scheduledAt: Date;
  serviceOrProduct: string;
  status: (typeof VALID_STATUS)[number];
  confirmationStatus: (typeof VALID_CONFIRMATION)[number];
  priority: (typeof VALID_PRIORITY)[number];
  notes: string | null;
};

export interface ImportRowResult {
  /** Número de fila en el Excel (1 = encabezado). */
  row: number;
  data: Partial<Record<string, string>>;
  errors: string[];
  duplicate: boolean;
  /** true si la fila se insertó (solo en import real). */
  imported: boolean;
}

export interface ImportResult {
  preview: boolean;
  total: number;
  valid: number;
  invalid: number;
  duplicates: number;
  imported: number;
  rows: ImportRowResult[];
}

// ─── Export ──────────────────────────────────────────────────────────────────

function styleHeaderRow(sheet: ExcelJS.Worksheet) {
  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF6D28D9" } };
  header.alignment = { vertical: "middle" };
  header.height = 20;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Exporta la agenda (con los mismos filtros del listado) a un workbook .xlsx. */
export async function exportAppointmentsToExcel(
  tenantId: string,
  filters: { search?: string; status?: string; priority?: string; dateFrom?: string; dateTo?: string }
): Promise<Buffer> {
  // Export completo: sin default de 30 días y sin paginación (hasta 10k filas)
  const { items: appointments } = await listAppointments(tenantId, {
    ...filters,
    applyDefaultRange: false,
    page: 1,
    limit: 10_000,
  } as Parameters<typeof listAppointments>[1]);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Sendwary";
  const sheet = workbook.addWorksheet("Citas");
  sheet.columns = COLUMNS.map((c) => ({ header: c.header, key: c.key, width: c.width }));

  for (const a of appointments) {
    const d = new Date(a.scheduledAt);
    sheet.addRow({
      customerName: a.customerName,
      customerPhone: a.customerPhone,
      customerEmail: a.customerEmail ?? "",
      scheduledDate: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
      scheduledTime: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
      serviceOrProduct: a.serviceOrProduct,
      status: a.status,
      confirmationStatus: a.confirmationStatus,
      priority: a.priority,
      notes: a.notes ?? "",
    });
  }

  styleHeaderRow(sheet);
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

// ─── Plantilla ───────────────────────────────────────────────────────────────

/** Plantilla con fila de ejemplo + hoja de instrucciones con valores válidos. */
export async function buildAppointmentsTemplate(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Sendwary";

  const sheet = workbook.addWorksheet("Citas");
  sheet.columns = COLUMNS.map((c) => ({ header: c.header, key: c.key, width: c.width }));

  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
  sheet.addRow({
    customerName: "Juan Pérez",
    customerPhone: "18095551234",
    customerEmail: "juan@ejemplo.com",
    scheduledDate: `${tomorrow.getFullYear()}-${pad(tomorrow.getMonth() + 1)}-${pad(tomorrow.getDate())}`,
    scheduledTime: "10:30",
    serviceOrProduct: "Consulta general",
    status: "PENDING",
    confirmationStatus: "UNCONFIRMED",
    priority: "NORMAL",
    notes: "Fila de ejemplo: bórrala antes de importar",
  });
  styleHeaderRow(sheet);

  const help = workbook.addWorksheet("Instrucciones");
  help.columns = [{ width: 24 }, { width: 70 }];
  const lines: [string, string][] = [
    ["Campo", "Reglas"],
    ["customerName", "Obligatorio. Nombre del cliente (mínimo 2 caracteres)."],
    ["customerPhone", "Obligatorio. Solo dígitos (6 a 30), puede incluir + inicial. Ej: 18095551234"],
    ["customerEmail", "Opcional. Correo válido."],
    ["scheduledDate", "Obligatorio. Formato AAAA-MM-DD (ej: 2026-08-15) o celda de fecha de Excel."],
    ["scheduledTime", "Obligatorio. Formato HH:MM en 24 horas (ej: 14:30)."],
    ["serviceOrProduct", "Obligatorio. Servicio o producto de la cita."],
    ["status", `Opcional. Uno de: ${VALID_STATUS.join(", ")}. Vacío = PENDING.`],
    ["confirmationStatus", `Opcional. Uno de: ${VALID_CONFIRMATION.join(", ")}. Vacío = según status.`],
    ["priority", `Opcional. Uno de: ${VALID_PRIORITY.join(", ")}. Vacío = NORMAL.`],
    ["notes", "Opcional. Notas internas (máx. 2000 caracteres)."],
    ["", ""],
    ["Duplicados", "Una fila se considera duplicada si ya existe una cita con el mismo teléfono a la misma fecha/hora."],
    ["Preview", "Usa la vista previa en Sendwary para revisar errores antes de importar."],
  ];
  for (const l of lines) help.addRow(l);
  help.getRow(1).font = { bold: true };

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

// ─── Import ──────────────────────────────────────────────────────────────────

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    // Rich text / formula / hyperlink de Excel
    const v = value as { text?: string; result?: unknown; richText?: { text: string }[] };
    if (typeof v.text === "string") return v.text;
    if (Array.isArray(v.richText)) return v.richText.map((r) => r.text).join("");
    if (v.result !== undefined) return String(v.result);
    return "";
  }
  return String(value).trim();
}

/** Acepta "AAAA-MM-DD", "DD/MM/AAAA" o celda Date de Excel. */
function parseDatePart(raw: ExcelJS.CellValue): { y: number; m: number; d: number } | null {
  if (raw instanceof Date) {
    return { y: raw.getUTCFullYear(), m: raw.getUTCMonth() + 1, d: raw.getUTCDate() };
  }
  const text = cellText(raw).slice(0, 10);
  let match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
  match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (match) return { y: Number(match[3]), m: Number(match[2]), d: Number(match[1]) };
  return null;
}

/** Acepta "HH:MM" o celda Date/hora de Excel. */
function parseTimePart(raw: ExcelJS.CellValue): { h: number; min: number } | null {
  if (raw instanceof Date) {
    return { h: raw.getUTCHours(), min: raw.getUTCMinutes() };
  }
  const match = cellText(raw).match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const h = Number(match[1]);
  const min = Number(match[2]);
  if (h > 23 || min > 59) return null;
  return { h, min };
}

function normalizePhone(raw: string): string {
  return raw.replace(/[\s()+-]/g, "");
}

function validateRow(cells: Record<string, ExcelJS.CellValue>): { data?: ImportRowData; errors: string[] } {
  const errors: string[] = [];

  const customerName = cellText(cells.customerName);
  if (customerName.length < 2) errors.push("customerName: obligatorio (mínimo 2 caracteres)");

  const phoneRaw = normalizePhone(cellText(cells.customerPhone));
  if (!/^\d{6,30}$/.test(phoneRaw)) {
    errors.push("customerPhone: obligatorio, solo dígitos (6 a 30)");
  }

  const emailText = cellText(cells.customerEmail);
  const customerEmail = emailText ? emailText.toLowerCase() : null;
  if (customerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) {
    errors.push("customerEmail: formato de correo inválido");
  }

  const datePart = parseDatePart(cells.scheduledDate);
  if (!datePart) errors.push("scheduledDate: usa el formato AAAA-MM-DD");
  const timePart = parseTimePart(cells.scheduledTime);
  if (!timePart) errors.push("scheduledTime: usa el formato HH:MM (24 horas)");

  let scheduledAt: Date | null = null;
  if (datePart && timePart) {
    scheduledAt = new Date(datePart.y, datePart.m - 1, datePart.d, timePart.h, timePart.min, 0, 0);
    if (Number.isNaN(scheduledAt.getTime())) {
      scheduledAt = null;
      errors.push("scheduledDate/scheduledTime: fecha u hora inválida");
    }
  }

  const serviceOrProduct = cellText(cells.serviceOrProduct);
  if (serviceOrProduct.length < 2) errors.push("serviceOrProduct: obligatorio");

  const statusText = cellText(cells.status).toUpperCase() || "PENDING";
  if (!VALID_STATUS.includes(statusText as (typeof VALID_STATUS)[number])) {
    errors.push(`status: debe ser uno de ${VALID_STATUS.join(", ")}`);
  }

  const confirmationText = cellText(cells.confirmationStatus).toUpperCase();
  const confirmationStatus =
    confirmationText ||
    (statusText === "CONFIRMED" ? "CONFIRMED" : statusText === "CANCELLED" ? "CANCELLED" : "UNCONFIRMED");
  if (!VALID_CONFIRMATION.includes(confirmationStatus as (typeof VALID_CONFIRMATION)[number])) {
    errors.push(`confirmationStatus: debe ser uno de ${VALID_CONFIRMATION.join(", ")}`);
  }

  const priorityText = cellText(cells.priority).toUpperCase() || "NORMAL";
  if (!VALID_PRIORITY.includes(priorityText as (typeof VALID_PRIORITY)[number])) {
    errors.push(`priority: debe ser uno de ${VALID_PRIORITY.join(", ")}`);
  }

  const notesText = cellText(cells.notes);
  if (notesText.length > 2000) errors.push("notes: máximo 2000 caracteres");

  if (errors.length > 0) return { errors };

  return {
    errors: [],
    data: {
      customerName,
      customerPhone: phoneRaw,
      customerEmail,
      scheduledAt: scheduledAt as Date,
      serviceOrProduct,
      status: statusText as (typeof VALID_STATUS)[number],
      confirmationStatus: confirmationStatus as (typeof VALID_CONFIRMATION)[number],
      priority: priorityText as (typeof VALID_PRIORITY)[number],
      notes: notesText || null,
    },
  };
}

/** Resumen legible de la fila para el preview del frontend. */
function describeRow(cells: Record<string, ExcelJS.CellValue>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const c of COLUMNS) {
    const text = c.key === "scheduledDate" || c.key === "scheduledTime"
      ? describeDateCell(cells[c.key], c.key)
      : cellText(cells[c.key]);
    if (text) out[c.key] = text.slice(0, 120);
  }
  return out;
}

function describeDateCell(value: ExcelJS.CellValue, kind: string): string {
  if (value instanceof Date) {
    return kind === "scheduledDate"
      ? `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}`
      : `${pad(value.getUTCHours())}:${pad(value.getUTCMinutes())}`;
  }
  return cellText(value);
}

/**
 * Importa citas desde un .xlsx. Con preview=true valida y reporta sin
 * insertar nada. Nunca inserta filas inválidas ni duplicadas.
 */
export async function importAppointmentsFromExcel(
  tenantId: string,
  fileBuffer: Buffer,
  options: { preview: boolean }
): Promise<ImportResult> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(fileBuffer as unknown as ExcelJS.Buffer);
  } catch {
    throw new AppError("El archivo no es un .xlsx válido", 400);
  }

  const sheet = workbook.worksheets[0];
  if (!sheet || sheet.rowCount < 2) {
    return { preview: options.preview, total: 0, valid: 0, invalid: 0, duplicates: 0, imported: 0, rows: [] };
  }

  // Mapa de columnas por nombre de encabezado (tolera orden distinto)
  const headerRow = sheet.getRow(1);
  const columnIndex: Record<string, number> = {};
  headerRow.eachCell((cell, col) => {
    const name = cellText(cell.value).trim();
    const known = COLUMNS.find((c) => c.header.toLowerCase() === name.toLowerCase());
    if (known) columnIndex[known.key] = col;
  });
  const missingHeaders = ["customerName", "customerPhone", "scheduledDate", "scheduledTime", "serviceOrProduct"]
    .filter((k) => !columnIndex[k]);
  if (missingHeaders.length > 0) {
    throw new AppError(
      `Faltan columnas obligatorias en el Excel: ${missingHeaders.join(", ")}. Descarga la plantilla oficial.`,
      400
    );
  }

  const results: ImportRowResult[] = [];
  const validRows: { rowNumber: number; data: ImportRowData }[] = [];
  const MAX_ROWS = 1000;

  for (let rowNumber = 2; rowNumber <= Math.min(sheet.rowCount, MAX_ROWS + 1); rowNumber++) {
    const row = sheet.getRow(rowNumber);
    const cells: Record<string, ExcelJS.CellValue> = {};
    for (const c of COLUMNS) {
      cells[c.key] = columnIndex[c.key] ? row.getCell(columnIndex[c.key]).value : null;
    }

    // Fila totalmente vacía: se ignora sin reportar error
    const isEmpty = COLUMNS.every((c) => cellText(cells[c.key]) === "");
    if (isEmpty) continue;

    const { data, errors } = validateRow(cells);
    results.push({ row: rowNumber, data: describeRow(cells), errors, duplicate: false, imported: false });
    if (data) validRows.push({ rowNumber, data });
  }

  // ── Duplicados: contra la BD (mismo teléfono + misma fecha/hora) y dentro del archivo
  const seenInFile = new Set<string>();
  const keyOf = (d: ImportRowData) => `${d.customerPhone}|${d.scheduledAt.getTime()}`;

  const dbMatches = validRows.length
    ? await prisma.appointment.findMany({
        where: {
          tenantId,
          OR: validRows.map(({ data }) => ({
            customerPhone: data.customerPhone,
            scheduledAt: data.scheduledAt,
          })),
        },
        select: { customerPhone: true, scheduledAt: true },
      })
    : [];
  const existingKeys = new Set(dbMatches.map((m) => `${m.customerPhone}|${new Date(m.scheduledAt).getTime()}`));

  const toInsert: { rowNumber: number; data: ImportRowData }[] = [];
  for (const item of validRows) {
    const key = keyOf(item.data);
    const result = results.find((r) => r.row === item.rowNumber);
    if (!result) continue;
    if (existingKeys.has(key) || seenInFile.has(key)) {
      result.duplicate = true;
    } else {
      seenInFile.add(key);
      toInsert.push(item);
    }
  }

  // ── Inserción (solo import real)
  let imported = 0;
  if (!options.preview && toInsert.length > 0) {
    await prisma.appointment.createMany({
      data: toInsert.map(({ data }) => ({
        tenantId,
        customerName: data.customerName,
        customerPhone: data.customerPhone,
        customerEmail: data.customerEmail,
        scheduledAt: data.scheduledAt,
        serviceOrProduct: data.serviceOrProduct,
        status: data.status as Prisma.AppointmentCreateManyInput["status"],
        confirmationStatus: data.confirmationStatus as Prisma.AppointmentCreateManyInput["confirmationStatus"],
        priority: data.priority as Prisma.AppointmentCreateManyInput["priority"],
        notes: data.notes,
        source: "MANUAL",
        confirmedAt: data.confirmationStatus === "CONFIRMED" ? new Date() : null,
      })),
    });
    imported = toInsert.length;
    for (const item of toInsert) {
      const result = results.find((r) => r.row === item.rowNumber);
      if (result) result.imported = true;
    }
    logger.info(`[EXCEL IMPORT] tenant=${tenantId} citas importadas=${imported}`);
  }

  const invalid = results.filter((r) => r.errors.length > 0).length;
  const duplicates = results.filter((r) => r.duplicate).length;

  return {
    preview: options.preview,
    total: results.length,
    valid: validRows.length,
    invalid,
    duplicates,
    imported,
    rows: results,
  };
}
