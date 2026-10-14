import type { FieldType } from "../../field/field-types";
import {
  EXCHANGE_COLUMNS,
  type ExchangeField,
  matchHeader,
  splitList,
} from "./format";
import { type CellValue, cellText } from "./parse-file";
import { parseSheetDate } from "./sheet-dates";

// Del cuadro de celdas a filas con significado. Sigue siendo puro: recibe el
// mapeo ya decidido y los tipos de los campos personalizados, y no toca la base
// de datos. Lo que resuelve contra Riuna —quien es "ana@…", que epica se llama
// "Obra"— es cosa del controlador.

export type ColumnTarget =
  | { kind: "field"; field: ExchangeField }
  | {
      kind: "custom";
      key: string;
      /**
       * Definicion a crear si la clave no existe todavia. El tipo lo confirma
       * quien importa: `type` y `key` son inmutables (ADR 013), asi que la
       * inferencia solo puede proponerlo, nunca decidirlo.
       */
      create?: { name: string; type: FieldType; options?: string[] };
    }
  | { kind: "ignore" };

export type ColumnMapping = {
  /** Indice de la columna en el fichero, base 0. */
  index: number;
  target: ColumnTarget;
};

export type MappedRow = {
  /** Fila de datos en el fichero, base 0. Es lo que cita el informe. */
  index: number;
  id: string | null;
  reference: string | null;
  outline: string;
  title: string;
  /** Ya resuelta entre `Descripción` y `Descripción (HTML)`. */
  description: string | null;
  status: string | null;
  priority: string | null;
  assignee: string | null;
  assignees: string[];
  team: string | null;
  epics: string[];
  labels: string[];
  startDate: Date | null;
  dueDate: Date | null;
  estimateSeconds: number | null;
  /** Valores por clave de campo. `null` es "borra"; ausente es "no toques". */
  customFields: Record<string, unknown>;
  /** Problemas de la propia fila, ya legibles. */
  errors: string[];
};

const SECONDS_PER_HOUR = 3600;

/** El mapeo que el asistente propone antes de que nadie lo toque. */
export function proposeMapping(headers: readonly string[]): ColumnMapping[] {
  return headers.map((header, index) => {
    const match = matchHeader(header);

    if (match.kind === "reserved") {
      // La clave es derivada: se exporta para poder citar una tarea, pero
      // reimportarla no significa nada porque quien manda es `ID`.
      if (match.column.field === "key") {
        return { index, target: { kind: "ignore" } as ColumnTarget };
      }
      return {
        index,
        target: { kind: "field", field: match.column.field } as ColumnTarget,
      };
    }

    if (match.kind === "custom") {
      return {
        index,
        target: { kind: "custom", key: match.key } as ColumnTarget,
      };
    }

    return { index, target: { kind: "ignore" } as ColumnTarget };
  });
}

const MULTI_FIELDS = new Set<ExchangeField>(
  EXCHANGE_COLUMNS.filter((column) => column.multi).map(
    (column) => column.field,
  ),
);

export function mapRows(
  rows: readonly CellValue[][],
  mapping: readonly ColumnMapping[],
  fieldTypes: ReadonlyMap<string, FieldType>,
): MappedRow[] {
  return rows.map((cells, index) => mapRow(cells, index, mapping, fieldTypes));
}

function mapRow(
  cells: readonly CellValue[],
  index: number,
  mapping: readonly ColumnMapping[],
  fieldTypes: ReadonlyMap<string, FieldType>,
): MappedRow {
  const row: MappedRow = {
    index,
    id: null,
    reference: null,
    outline: "",
    title: "",
    description: null,
    status: null,
    priority: null,
    assignee: null,
    assignees: [],
    team: null,
    epics: [],
    labels: [],
    startDate: null,
    dueDate: null,
    estimateSeconds: null,
    customFields: {},
    errors: [],
  };

  // La columna de texto se lee primero y la de HTML puede pisarla. Es el orden
  // de la ADR 017: si el fichero trae las dos, gana la enriquecida, porque es
  // la que no ha perdido nada.
  let plainDescription: string | null = null;
  let htmlDescription: string | null = null;

  for (const column of mapping) {
    if (column.target.kind === "ignore") continue;

    const raw = cells[column.index] ?? null;
    const text = cellText(raw);

    if (column.target.kind === "custom") {
      const type = fieldTypes.get(column.target.key);
      if (!type) continue;

      const value = coerceCustomValue(type, raw, text);
      if (value !== undefined) {
        row.customFields[column.target.key] = value;
      }
      continue;
    }

    const field = column.target.field;

    if (MULTI_FIELDS.has(field)) {
      const values = splitList(text);
      if (field === "assignees") row.assignees = values;
      if (field === "epics") row.epics = values;
      if (field === "labels") row.labels = values;
      continue;
    }

    switch (field) {
      case "id":
        row.id = text || null;
        break;
      case "reference":
        row.reference = text || null;
        break;
      case "outline":
        row.outline = text;
        break;
      case "title":
        row.title = text;
        break;
      case "description":
        plainDescription = text;
        break;
      case "descriptionHtml":
        htmlDescription = text;
        break;
      case "status":
        row.status = text || null;
        break;
      case "priority":
        row.priority = text || null;
        break;
      case "assignee":
        row.assignee = text || null;
        break;
      case "team":
        row.team = text || null;
        break;
      case "startDate":
      case "dueDate": {
        if (!text) break;
        const date = parseSheetDate(raw);
        if (!date) {
          row.errors.push(`"${text}" is not a date the importer understands`);
          break;
        }
        if (field === "startDate") row.startDate = date;
        else row.dueDate = date;
        break;
      }
      case "estimateHours": {
        if (!text) break;
        const hours = Number(text.replace(",", "."));
        if (!Number.isFinite(hours) || hours < 0) {
          row.errors.push(`"${text}" is not a number of hours`);
          break;
        }
        row.estimateSeconds = Math.round(hours * SECONDS_PER_HOUR);
        break;
      }
      default:
        break;
    }
  }

  row.description = htmlDescription || plainToHtml(plainDescription);

  // Un titulo vacio solo hunde una fila nueva. Una fila que casa con una tarea
  // existente y no trae la columna `Título` conserva el que tiene (ADR 017,
  // punto 3), asi que la exigencia se comprueba en el controlador, donde ya se
  // sabe si la fila es alta o actualizacion.

  return row;
}

/**
 * Envuelve el texto plano en parrafos, que es lo que el editor espera leer.
 * Devuelve `null` para una celda vacia, que significa "no toques la
 * descripcion" y no "borrala": una columna que el fichero no rellena no puede
 * vaciar lo que ya hay escrito.
 */
export function plainToHtml(text: string | null): string | null {
  if (!text) return null;

  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join("");
}

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

const TRUTHY = new Set(["si", "sí", "yes", "true", "verdadero", "x", "1", "✓"]);

/**
 * Lleva el texto de una celda al tipo del campo. `undefined` significa "la
 * columna no dice nada de esta tarea"; `null`, "vacia el valor".
 */
export function coerceCustomValue(
  type: FieldType,
  raw: CellValue,
  text: string,
): unknown | undefined {
  if (!text) {
    return null;
  }

  switch (type) {
    case "number":
    case "currency": {
      const value = Number(text.replace(",", "."));
      return Number.isFinite(value) ? value : undefined;
    }
    case "checkbox":
      return TRUTHY.has(text.toLowerCase());
    case "date": {
      const date = parseSheetDate(raw);
      return date ? date.toISOString().slice(0, 10) : undefined;
    }
    case "multi_select":
      return splitList(text);
    case "relation":
      // Su valor son filas de `task_relation`, no JSONB. Ver ADR 013.
      return undefined;
    case "formula":
      // Lo calcula la base (ADR 090): la columna que trae la exportacion se
      // lee y se descarta, para que la ida y vuelta no falle.
      return undefined;
    default:
      return text;
  }
}
