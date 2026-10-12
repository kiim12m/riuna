import { type SQL, sql } from "drizzle-orm";
import {
  labelTable,
  taskAssigneeTable,
  taskEpicTable,
  taskTable,
  taskWatcherTable,
} from "../database/schema";
import { addDays } from "../utils/day-boundaries";
import type {
  FieldDescriptor,
  FieldRegistry,
  ValueType,
} from "./field-registry";

type MembershipRelation = Extract<
  FieldDescriptor,
  { kind: "membership" }
>["relation"];

export type FilterOperator =
  | "eq"
  | "neq"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "contains"
  | "startsWith"
  | "in"
  | "notIn"
  | "isEmpty"
  | "isNotEmpty";

export type FilterNode =
  | { type: "and"; children: FilterNode[] }
  | { type: "or"; children: FilterNode[] }
  | { type: "not"; child: FilterNode }
  | {
      type: "condition";
      field: string;
      operator: FilterOperator;
      value?: unknown;
    };

export class FilterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FilterError";
  }
}

// Un arbol muy anidado no es util y si es una forma barata de hacer trabajar a
// Postgres de mas. El limite es generoso para cualquier filtro escrito a mano.
const MAX_DEPTH = 10;

const OPERATORS_BY_VALUE_TYPE: Record<ValueType, FilterOperator[]> = {
  text: [
    "eq",
    "neq",
    "contains",
    "startsWith",
    "in",
    "notIn",
    "isEmpty",
    "isNotEmpty",
  ],
  id: ["eq", "neq", "in", "notIn", "isEmpty", "isNotEmpty"],
  number: [
    "eq",
    "neq",
    "gt",
    "gte",
    "lt",
    "lte",
    "in",
    "notIn",
    "isEmpty",
    "isNotEmpty",
  ],
  date: ["eq", "neq", "gt", "gte", "lt", "lte", "isEmpty", "isNotEmpty"],
  boolean: ["eq", "neq", "isEmpty", "isNotEmpty"],
  // Sobre una lista, `eq` significa "la contiene" e `in` "contiene alguna de".
  // No hay `contains` ni rangos: no se compara el array, se pregunta por lo
  // que hay dentro.
  idList: ["eq", "neq", "in", "notIn", "isEmpty", "isNotEmpty"],
};

// `jsonb_typeof` en vez de castear a ciegas. Una clave del JSONB puede tener
// hoy un numero y manana, tras cambiar la definicion o importar un fichero
// torcido, un texto; `(custom_fields->>'k')::numeric` reventaria la consulta
// entera con un error de conversion. Filtrar antes por tipo hace que esas
// filas simplemente no casen, que es lo que un filtro debe hacer.
function jsonNumeric(key: string): SQL {
  return sql`CASE WHEN jsonb_typeof(${taskTable.customFields} -> ${key}) = 'number'
    THEN (${taskTable.customFields} ->> ${key})::numeric END`;
}

function jsonText(key: string): SQL {
  return sql`CASE WHEN jsonb_typeof(${taskTable.customFields} -> ${key}) = 'string'
    THEN ${taskTable.customFields} ->> ${key} END`;
}

// Contencion sobre el objeto entero: es la unica forma correcta de preguntar
// si un array del JSONB tiene un valor, y ademas es exactamente lo que el
// indice GIN acelera. Extraerlo como texto —que es lo que hacia antes— nunca
// casa: un array no es una cadena, asi que la comparacion salia NULL y el
// filtro no devolvia nada, en silencio.
function jsonListContains(key: string, value: unknown): SQL {
  return sql`${taskTable.customFields} @> ${JSON.stringify({ [key]: [value] })}::jsonb`;
}

// "Tiene algo" es tener un array con al menos un elemento.
//
// Va en un CASE y no en un `AND`, por dos razones que las pruebas encontraron:
//
// 1. Postgres NO garantiza cortocircuito en `AND`, asi que
//    `jsonb_typeof(x) = 'array' AND jsonb_array_length(x) > 0` puede evaluar
//    la longitud sobre algo que no es un array y reventar con un 500. Eso pasa
//    en cuanto alguien cambie el tipo de un campo con datos dentro. El CASE si
//    fija el orden.
// 2. Con la clave ausente, `jsonb_typeof(NULL)` es NULL, y `NOT NULL` es NULL
//    y no `true`: "esta vacio" no devolvia las tareas sin el campo, que son
//    justo las que se estaban buscando. El `ELSE false` lo cierra.
function jsonListHasAny(key: string): SQL {
  return sql`CASE
    WHEN jsonb_typeof(${taskTable.customFields} -> ${key}) = 'array'
    THEN jsonb_array_length(${taskTable.customFields} -> ${key}) > 0
    ELSE false
  END`;
}

function jsonBoolean(key: string): SQL {
  return sql`CASE WHEN jsonb_typeof(${taskTable.customFields} -> ${key}) = 'boolean'
    THEN (${taskTable.customFields} ->> ${key})::boolean END`;
}

/**
 * La expresion comparable de un campo. Las fechas de un campo personalizado se
 * guardan como texto `YYYY-MM-DD`, que ordena igual como texto que como fecha,
 * asi que se comparan sin convertir.
 */
function comparableExpression(descriptor: FieldDescriptor): SQL {
  switch (descriptor.kind) {
    case "column":
      return sql`${descriptor.column}`;
    case "expression":
      return descriptor.expression;
    case "json":
      switch (descriptor.valueType) {
        case "number":
          return jsonNumeric(descriptor.key);
        case "boolean":
          return jsonBoolean(descriptor.key);
        case "idList":
          throw new FilterError(
            "A list field is asked what it contains, not compared as a value",
          );
        default:
          return jsonText(descriptor.key);
      }
    case "membership":
      throw new FilterError(
        "A membership field is compared with in/eq on its ids, not as a value",
      );
  }
}

/** El dia civil de una fecha, en el mismo `YYYY-MM-DD` que guarda el JSONB. */
function toIsoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * El valor de la comparacion, en la forma que espera el otro lado.
 *
 * Recibe el descriptor y no solo el tipo porque una fecha se compara de dos
 * maneras distintas segun donde viva. En una columna `timestamp` se compara
 * contra un `Date`. En el JSONB se guarda como texto `YYYY-MM-DD` —y asi la
 * compara `jsonText`—, asi que mandar un `Date` era comparar texto contra el
 * `2026-09-01T00:00:00.000+00:00` que node-postgres serializa: `eq` no casaba
 * nunca, `neq` casaba siempre, y en un servidor fuera de UTC el rango entero
 * se desplazaba un dia. Las pruebas no lo veian porque miraban el SQL generado
 * y nunca los parametros.
 */
// La pertenencia nunca llega aqui: se compara por ids, no como valor.
type ComparableDescriptor = Exclude<FieldDescriptor, { kind: "membership" }>;

function normalizeValue(
  descriptor: ComparableDescriptor,
  raw: unknown,
): unknown {
  const valueType = descriptor.valueType;

  if (valueType === "date") {
    const date =
      raw instanceof Date
        ? raw
        : typeof raw === "string" || typeof raw === "number"
          ? new Date(raw)
          : null;

    if (!date) {
      throw new FilterError("A date filter needs a date");
    }

    if (Number.isNaN(date.getTime())) {
      throw new FilterError(`"${String(raw)}" is not a valid date`);
    }

    return descriptor.kind === "json" ? toIsoDay(date) : date;
  }

  if (valueType === "number") {
    if (typeof raw !== "number" || !Number.isFinite(raw)) {
      throw new FilterError("A number filter needs a finite number");
    }
    return raw;
  }

  if (valueType === "boolean") {
    if (typeof raw !== "boolean") {
      throw new FilterError("A boolean filter needs true or false");
    }
    return raw;
  }

  if (typeof raw !== "string") {
    throw new FilterError("This filter needs a text value");
  }

  return raw;
}

const DAY_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/u;

/**
 * El dia del servidor que nombra un valor de fecha suelta (`2026-09-01`, lo que
 * manda `<input type="date">`) sobre una columna `timestamp`, como el rango
 * `[inicio, fin)` de ese dia. Es `null` para todo lo demas: un instante
 * completo sigue siendo un instante.
 *
 * Una columna `timestamp` guarda un instante, y comparar «vence el 5 de
 * octubre» contra la medianoche UTC de ese dia no casaba con nada que se
 * hubiera elegido en el navegador: el vencimiento guarda la medianoche de
 * Madrid. «Un dia» es el de la zona de la API (ADR 049), la misma que usan Hoy
 * y los paneles, y por eso se resuelve aqui y no en el cliente.
 */
function dayBounds(
  descriptor: ComparableDescriptor,
  raw: unknown,
): { start: Date; end: Date } | null {
  if (descriptor.kind !== "column" || descriptor.valueType !== "date") {
    return null;
  }
  if (typeof raw !== "string") return null;
  const match = DAY_ONLY.exec(raw);
  if (!match) return null;

  const [, year, month, day] = match.map(Number);
  const start = new Date(year as number, (month as number) - 1, day as number);
  // `new Date(2026, 12, 45)` no falla: se desborda al ano siguiente.
  if (
    start.getFullYear() !== year ||
    start.getMonth() !== (month as number) - 1 ||
    start.getDate() !== day
  ) {
    throw new FilterError(`"${raw}" is not a valid date`);
  }
  return { start, end: addDays(start, 1) };
}

/** La comparacion de una columna con un dia entero, no con un instante. */
function dayComparison(
  expression: SQL,
  operator: "eq" | "neq" | "gt" | "gte" | "lt" | "lte",
  { start, end }: { start: Date; end: Date },
): SQL {
  switch (operator) {
    case "eq":
      return sql`(${expression} >= ${start} AND ${expression} < ${end})`;
    case "neq":
      return sql`(${expression} IS NULL OR ${expression} < ${start} OR ${expression} >= ${end})`;
    case "gt":
      return sql`${expression} >= ${end}`;
    case "gte":
      return sql`${expression} >= ${start}`;
    case "lt":
      return sql`${expression} < ${start}`;
    case "lte":
      return sql`${expression} < ${end}`;
  }
}

/**
 * Los ids de un filtro de pertenencia, comprobados uno a uno.
 *
 * Era el unico camino que no normalizaba su valor. Como `value` es opcional en
 * el esquema, un filtro sin el llegaba aqui como `[undefined]`, y drizzle
 * omite los `undefined` al expandir un array: el resultado era `IN ()`, un
 * error de sintaxis de Postgres, y por tanto un **500** en vez del 400 que
 * corresponde a un filtro mal formado.
 */
function toIdList(values: unknown[]): string[] {
  return values.map((value) => {
    if (typeof value !== "string" || value === "") {
      throw new FilterError("A membership filter needs one or more ids");
    }
    return value;
  });
}

function toList(value: unknown): unknown[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new FilterError("in/notIn need a non-empty list");
  }
  return value;
}

// El EXISTS de pertenencia. Va en la consulta y no despues porque una vista
// paginada que filtrase en memoria devolveria paginas incompletas, que es la
// razon por la que el filtro de epicas ya se escribio asi en la Fase 2.
function membershipCondition(
  relation: MembershipRelation,
  ids: unknown[],
): SQL {
  switch (relation) {
    case "epic":
      return sql`EXISTS (SELECT 1 FROM ${taskEpicTable}
        WHERE ${taskEpicTable.taskId} = ${taskTable.id}
        AND ${taskEpicTable.epicId} IN ${ids})`;
    case "label":
      // Por nombre y no por id: `label` no es una tabla de union, cada tarea
      // tiene sus propias filas de etiqueta y sus ids no se repiten entre
      // tareas. Lo que identifica "la misma etiqueta" en este esquema es el
      // nombre, que es justo lo que fija `unique(task_id, name)`.
      return sql`EXISTS (SELECT 1 FROM ${labelTable}
        WHERE ${labelTable.taskId} = ${taskTable.id}
        AND ${labelTable.name} IN ${ids})`;
    case "assignee":
      return sql`EXISTS (SELECT 1 FROM ${taskAssigneeTable}
        WHERE ${taskAssigneeTable.taskId} = ${taskTable.id}
        AND ${taskAssigneeTable.userId} IN ${ids})`;
    case "watcher":
      return sql`EXISTS (SELECT 1 FROM ${taskWatcherTable}
        WHERE ${taskWatcherTable.taskId} = ${taskTable.id}
        AND ${taskWatcherTable.userId} IN ${ids})`;
  }
}

function conditionToSql(
  node: Extract<FilterNode, { type: "condition" }>,
  registry: FieldRegistry,
): SQL {
  const descriptor = registry[node.field];

  // El registro es la lista blanca: un nombre que no este aqui no llega nunca
  // a la SQL.
  if (!descriptor) {
    throw new FilterError(`Unknown field "${node.field}"`);
  }

  if (descriptor.kind === "membership") {
    if (node.operator === "isEmpty") {
      return sql`NOT ${membershipExists(descriptor.relation)}`;
    }
    if (node.operator === "isNotEmpty") {
      return membershipExists(descriptor.relation);
    }
    if (node.operator === "eq" || node.operator === "in") {
      const ids = toIdList(
        node.operator === "eq" ? [node.value] : toList(node.value),
      );
      return membershipCondition(descriptor.relation, ids);
    }
    if (node.operator === "neq" || node.operator === "notIn") {
      const ids = toIdList(
        node.operator === "neq" ? [node.value] : toList(node.value),
      );
      return sql`NOT ${membershipCondition(descriptor.relation, ids)}`;
    }
    throw new FilterError(
      `"${node.operator}" cannot be used on "${node.field}"`,
    );
  }

  // Una lista se pregunta por contencion, no se compara: va antes de la
  // maquinaria de comparacion porque no puede pasar por ella.
  if (descriptor.kind === "json" && descriptor.valueType === "idList") {
    const { key } = descriptor;

    switch (node.operator) {
      case "isEmpty":
        return sql`NOT ${jsonListHasAny(key)}`;
      case "isNotEmpty":
        return jsonListHasAny(key);
      case "eq":
        return jsonListContains(key, node.value);
      case "neq":
        return sql`NOT ${jsonListContains(key, node.value)}`;
      case "in": {
        const parts = toList(node.value).map((value) =>
          jsonListContains(key, value),
        );
        return sql`(${sql.join(parts, sql` OR `)})`;
      }
      case "notIn": {
        const parts = toList(node.value).map((value) =>
          jsonListContains(key, value),
        );
        return sql`NOT (${sql.join(parts, sql` OR `)})`;
      }
      default:
        throw new FilterError(
          `"${node.operator}" cannot be used on "${node.field}"`,
        );
    }
  }

  const allowed = OPERATORS_BY_VALUE_TYPE[descriptor.valueType];

  if (!allowed.includes(node.operator)) {
    throw new FilterError(
      `"${node.operator}" cannot be used on "${node.field}"`,
    );
  }

  const expression = comparableExpression(descriptor);

  // Una columna de texto heredada guarda `''`, no NULL: `create-task` escribe
  // `description: description || ""`. Con solo `IS NULL`, "sin descripcion" no
  // devolvia ninguna tarea y "con descripcion" las devolvia todas.
  const emptyIsAlsoBlank =
    descriptor.kind === "column" && descriptor.valueType === "text";

  switch (node.operator) {
    case "isEmpty":
      return emptyIsAlsoBlank
        ? sql`(${expression} IS NULL OR ${expression} = '')`
        : sql`${expression} IS NULL`;
    case "isNotEmpty":
      return emptyIsAlsoBlank
        ? sql`(${expression} IS NOT NULL AND ${expression} <> '')`
        : sql`${expression} IS NOT NULL`;
    case "in": {
      const values = toList(node.value).map((value) =>
        normalizeValue(descriptor, value),
      );
      return sql`${expression} IN ${values}`;
    }
    case "notIn": {
      const values = toList(node.value).map((value) =>
        normalizeValue(descriptor, value),
      );
      // `NOT IN` deja fuera las filas nulas, que casi nunca es lo que quien
      // escribe el filtro espera: "prioridad distinta de alta" deberia incluir
      // las que no tienen prioridad.
      return sql`(${expression} IS NULL OR ${expression} NOT IN ${values})`;
    }
    case "contains": {
      const value = normalizeValue(descriptor, node.value) as string;
      return sql`${expression} ILIKE ${`%${escapeLike(value)}%`}`;
    }
    case "startsWith": {
      const value = normalizeValue(descriptor, node.value) as string;
      return sql`${expression} ILIKE ${`${escapeLike(value)}%`}`;
    }
    case "neq": {
      const day = dayBounds(descriptor, node.value);
      if (day) return dayComparison(expression, "neq", day);
      const value = normalizeValue(descriptor, node.value);
      return sql`(${expression} IS NULL OR ${expression} <> ${value})`;
    }
    default: {
      const day = dayBounds(descriptor, node.value);
      if (day) return dayComparison(expression, node.operator, day);
      const value = normalizeValue(descriptor, node.value);
      const comparison = {
        eq: sql`=`,
        gt: sql`>`,
        gte: sql`>=`,
        lt: sql`<`,
        lte: sql`<=`,
      }[node.operator];
      return sql`${expression} ${comparison} ${value}`;
    }
  }
}

function membershipExists(relation: MembershipRelation): SQL {
  switch (relation) {
    case "epic":
      return sql`EXISTS (SELECT 1 FROM ${taskEpicTable}
        WHERE ${taskEpicTable.taskId} = ${taskTable.id})`;
    case "label":
      return sql`EXISTS (SELECT 1 FROM ${labelTable}
        WHERE ${labelTable.taskId} = ${taskTable.id})`;
    case "assignee":
      return sql`EXISTS (SELECT 1 FROM ${taskAssigneeTable}
        WHERE ${taskAssigneeTable.taskId} = ${taskTable.id})`;
    case "watcher":
      return sql`EXISTS (SELECT 1 FROM ${taskWatcherTable}
        WHERE ${taskWatcherTable.taskId} = ${taskTable.id})`;
  }
}

// Los comodines de LIKE dentro del texto que busca el usuario son literales:
// buscar "50%" no puede convertirse en "empieza por 50".
function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

/**
 * Traduce un arbol de filtros al `SQL` de Drizzle. Devuelve `undefined` cuando
 * el arbol no impone ninguna condicion, para que quien llama no tenga que
 * distinguir "sin filtro" de "filtro vacio".
 */
export function filterToSql(
  node: FilterNode | null | undefined,
  registry: FieldRegistry,
  depth = 0,
): SQL | undefined {
  if (!node) return undefined;

  if (depth > MAX_DEPTH) {
    throw new FilterError("The filter is nested too deeply");
  }

  switch (node.type) {
    case "and":
    case "or": {
      const parts = node.children
        .map((child) => filterToSql(child, registry, depth + 1))
        .filter((part): part is SQL => part !== undefined);

      if (parts.length === 0) return undefined;
      if (parts.length === 1) return parts[0];

      const joiner = node.type === "and" ? sql` AND ` : sql` OR `;
      return sql`(${sql.join(parts, joiner)})`;
    }
    case "not": {
      const inner = filterToSql(node.child, registry, depth + 1);
      return inner === undefined ? undefined : sql`NOT (${inner})`;
    }
    case "condition":
      return conditionToSql(node, registry);
    default:
      throw new FilterError("Unknown filter node");
  }
}
