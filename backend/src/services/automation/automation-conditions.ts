/**
 * DSL de condiciones de las reglas (AutomationRule.conditionsJson).
 *
 * Es un evaluador PURO (sin acceso a BD ni a red): recibe el contexto del
 * evento y devuelve boolean. Así se puede testear sin infraestructura y no
 * puede convertirse en un vector de ejecución de código arbitrario.
 *
 * Forma:
 *   { "all": [ {"field": "status", "op": "eq", "value": "COMPLETED"} ] }
 *   { "any": [ ... ], "not": { ... } }
 *
 * Campos: rutas con punto sobre el contexto, ej. "payload.serviceOrProduct",
 * "event.type", "payload.amount".
 */

export type ConditionOperator =
  | "eq"
  | "ne"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "in"
  | "nin"
  | "exists"
  | "contains";

export interface LeafCondition {
  field: string;
  op: ConditionOperator;
  value?: unknown;
}

export interface GroupCondition {
  all?: AutomationCondition[];
  any?: AutomationCondition[];
  not?: AutomationCondition;
}

export type AutomationCondition = LeafCondition | GroupCondition;

export interface ConditionContext {
  event: {
    type: string;
    source: string;
    entityType?: string | null;
    entityId?: string | null;
    occurredAt: Date;
  };
  payload: Record<string, unknown>;
  tenant?: { timezone?: string };
}

const OPERATORS: ConditionOperator[] = [
  "eq",
  "ne",
  "gt",
  "gte",
  "lt",
  "lte",
  "in",
  "nin",
  "exists",
  "contains",
];

function isGroup(condition: AutomationCondition): condition is GroupCondition {
  return (
    typeof condition === "object" &&
    condition !== null &&
    ("all" in condition || "any" in condition || "not" in condition)
  );
}

/** Lee "a.b.c" del contexto. Devuelve undefined si algún tramo no existe. */
export function resolveFieldPath(context: ConditionContext, path: string): unknown {
  const segments = path.split(".").filter(Boolean);
  if (segments.length === 0) return undefined;

  // "event.x", "payload.x" y "tenant.x" son rutas explícitas; cualquier otra
  // se resuelve contra el payload (atajo cómodo: "status" == "payload.status").
  const isExplicitRoot = ["event", "payload", "tenant"].includes(segments[0]);
  let current: unknown = isExplicitRoot
    ? (context as unknown as Record<string, unknown>)
    : context.payload;

  for (const segment of segments) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function toComparable(value: unknown): number | string | null {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const asDate = Date.parse(value);
    if (!Number.isNaN(asDate) && /\d{4}-\d{2}-\d{2}/.test(value)) return asDate;
    const asNumber = Number(value);
    return Number.isNaN(asNumber) ? value : asNumber;
  }
  return null;
}

function evaluateLeaf(condition: LeafCondition, context: ConditionContext): boolean {
  const actual = resolveFieldPath(context, condition.field);

  switch (condition.op) {
    case "exists":
      return condition.value === false ? actual === undefined || actual === null : actual !== undefined && actual !== null;
    case "eq":
      return actual instanceof Date && typeof condition.value === "string"
        ? actual.toISOString() === condition.value
        : actual === condition.value;
    case "ne":
      return actual !== condition.value;
    case "in":
      return Array.isArray(condition.value) && condition.value.includes(actual as never);
    case "nin":
      return Array.isArray(condition.value) && !condition.value.includes(actual as never);
    case "contains": {
      if (Array.isArray(actual)) return actual.includes(condition.value as never);
      if (typeof actual === "string" && typeof condition.value === "string") {
        return actual.toLowerCase().includes(condition.value.toLowerCase());
      }
      return false;
    }
    case "gt":
    case "gte":
    case "lt":
    case "lte": {
      const left = toComparable(actual);
      const right = toComparable(condition.value);
      if (left === null || right === null || typeof left !== typeof right) return false;
      if (condition.op === "gt") return left > right;
      if (condition.op === "gte") return left >= right;
      if (condition.op === "lt") return left < right;
      return left <= right;
    }
    default:
      return false;
  }
}

/**
 * Evalúa la condición. `null`/`undefined` = la regla siempre aplica.
 * Ante una condición malformada devuelve false (fail-closed): es preferible no
 * ejecutar una automatización que ejecutarla sobre una condición que no se
 * entiende.
 */
export function evaluateCondition(
  condition: AutomationCondition | null | undefined,
  context: ConditionContext
): boolean {
  if (condition === null || condition === undefined) return true;
  if (typeof condition !== "object") return false;

  if (isGroup(condition)) {
    if (condition.all && !condition.all.every((child) => evaluateCondition(child, context))) {
      return false;
    }
    if (condition.any && !condition.any.some((child) => evaluateCondition(child, context))) {
      return false;
    }
    if (condition.not && evaluateCondition(condition.not, context)) {
      return false;
    }
    return true;
  }

  const leaf = condition as LeafCondition;
  if (typeof leaf.field !== "string" || !OPERATORS.includes(leaf.op)) return false;
  return evaluateLeaf(leaf, context);
}

/** Valida la forma del DSL antes de guardar una regla (API). */
export function validateCondition(condition: unknown, depth = 0): string | null {
  if (condition === null || condition === undefined) return null;
  if (depth > 5) return "Las condiciones no pueden anidarse más de 5 niveles";
  if (typeof condition !== "object") return "Condición inválida: se esperaba un objeto";

  const candidate = condition as GroupCondition & LeafCondition;
  const isGroupShape =
    "all" in candidate || "any" in candidate || "not" in candidate;

  if (isGroupShape) {
    for (const key of ["all", "any"] as const) {
      const list = candidate[key];
      if (list === undefined) continue;
      if (!Array.isArray(list)) return `"${key}" debe ser una lista de condiciones`;
      for (const child of list) {
        const error = validateCondition(child, depth + 1);
        if (error) return error;
      }
    }
    if (candidate.not !== undefined) return validateCondition(candidate.not, depth + 1);
    return null;
  }

  if (typeof candidate.field !== "string" || candidate.field.trim() === "") {
    return 'Cada condición necesita un "field"';
  }
  if (!OPERATORS.includes(candidate.op)) {
    return `Operador inválido. Permitidos: ${OPERATORS.join(", ")}`;
  }
  return null;
}
