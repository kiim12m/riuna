import { coercePriority, coerceStatus } from "../validate-task-fields";
import { matchPriority } from "./format";
import { type ImportLookups, normalizeLookupKey, statusKeys } from "./lookups";
import type { ColumnMapping, MappedRow } from "./map-rows";
import type { LabelLink, Link } from "./reconcile-links";
import type { UpdatableField } from "./write-tasks";

// Resolucion de los valores de una fila contra lo que el proyecto conoce.
// Nada aqui escribe: todo son busquedas contra los mapas que `loadImportLookups`
// dejo cargados una sola vez.
//
// Un valor que no se reconoce **avisa y sigue**, nunca tumba la fila. Es la
// misma decision que `coerceStatus` y `coercePriority` ya tomaron para el
// importador heredado: en un fichero de 5.000 filas, rechazar la importacion
// entera por un estado mal escrito no ayuda a nadie.

/** Colores de reserva para una etiqueta que el espacio no conoce todavia. */
const LABEL_PALETTE = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#14b8a6",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
];

export function resolveStatus(
  row: MappedRow,
  lookups: ImportLookups,
  warnings: string[],
): string {
  if (!row.status) {
    return lookups.validStatuses[0] ?? "planned";
  }

  for (const clave of statusKeys(row.status)) {
    const bySlug = lookups.statusByName.get(clave);
    if (bySlug) {
      return bySlug;
    }
  }

  const { status, warning } = coerceStatus(row.status, lookups.validStatuses);
  if (warning) warnings.push(warning);
  return status;
}

export function resolvePriority(row: MappedRow, warnings: string[]): string {
  if (!row.priority) {
    return "no-priority";
  }

  const matched = matchPriority(row.priority);
  if (matched) {
    return matched;
  }

  const { priority, warning } = coercePriority(row.priority);
  if (warning) warnings.push(warning);
  return priority;
}

/**
 * De lo que la celda dice —correo, nombre o identificador— al usuario. Alguien
 * que no es del espacio de trabajo no se asigna: se avisa y la tarea entra sin
 * responsable, en vez de rechazar la fila.
 */
export function resolveUser(
  handle: string | null,
  lookups: ImportLookups,
  assignable: ReadonlySet<string>,
  warnings: string[],
): string | null {
  if (!handle) return null;

  const id = lookups.userByHandle.get(normalizeLookupKey(handle));
  if (id && assignable.has(id)) {
    return id;
  }

  warnings.push(`"${handle}" is not a member of this workspace`);
  return null;
}

/** Todos los identificadores de usuario que el fichero nombra, para validarlos de una vez. */
export function collectUserIds(
  rows: readonly MappedRow[],
  userByHandle: ReadonlyMap<string, string>,
): string[] {
  const ids = new Set<string>();

  for (const row of rows) {
    for (const handle of [row.assignee, ...row.assignees]) {
      if (!handle) continue;
      const id = userByHandle.get(normalizeLookupKey(handle));
      if (id) ids.add(id);
    }
  }

  return [...ids];
}

/** Que columnas de `task` trae el fichero. Lo que no mapea no se actualiza. */
export function mappedFields(
  mapping: readonly ColumnMapping[],
): Set<UpdatableField> {
  const fields = new Set<UpdatableField>();
  const byField: Record<string, UpdatableField> = {
    title: "title",
    description: "description",
    descriptionHtml: "description",
    status: "status",
    priority: "priority",
    startDate: "startDate",
    dueDate: "dueDate",
    estimateHours: "estimate",
    assignee: "assigneeId",
    team: "teamId",
  };

  for (const column of mapping) {
    if (column.target.kind !== "field") continue;
    const field = byField[column.target.field];
    if (field) fields.add(field);
  }

  return fields;
}

/** Que relaciones trae el fichero. Lo que no mapea no se reconcilia. */
export type MappedLinks = {
  assignees: boolean;
  epics: boolean;
  labels: boolean;
};

export function mappedLinks(mapping: readonly ColumnMapping[]): MappedLinks {
  const fields = new Set(
    mapping
      .filter((column) => column.target.kind === "field")
      .map((column) =>
        column.target.kind === "field" ? column.target.field : "",
      ),
  );

  return {
    assignees: fields.has("assignees") || fields.has("assignee"),
    epics: fields.has("epics"),
    labels: fields.has("labels"),
  };
}

export type LinkCollector = {
  lookups: ImportLookups;
  assignableIds: ReadonlySet<string>;
  epicIdByName: ReadonlyMap<string, string>;
  workspaceId: string;
  /** Responsable que quedara en `task.assignee_id` tras esta importacion. */
  assigneeId: string | null;
  assigneeLinks: Link[];
  epicLinks: Link[];
  labelLinks: LabelLink[];
  assigneeTaskIds: string[];
  epicTaskIds: string[];
  labelTaskIds: string[];
  links: MappedLinks;
};

/**
 * Apunta los enlaces de una fila para reconciliarlos por lotes despues.
 *
 * Solo se reconcilia lo que el fichero mapea: una columna ausente no puede
 * dejar una tarea sin etiquetas. Y el responsable principal entra ademas en el
 * conjunto de asignados, que es la invariante de la ADR 010.
 */
export function collectLinks(
  row: MappedRow,
  taskId: string,
  collector: LinkCollector,
): void {
  if (collector.links.assignees) {
    collector.assigneeTaskIds.push(taskId);

    const ids = new Set<string>();
    // El responsable principal entra **siempre** en el conjunto: escribir
    // `assignee_id` sin que `task_assignee` lo contenga es la divergencia que
    // la ADR 010 prohibe.
    if (collector.assigneeId) ids.add(collector.assigneeId);

    for (const handle of row.assignees) {
      const id = collector.lookups.userByHandle.get(normalizeLookupKey(handle));
      if (id && collector.assignableIds.has(id)) ids.add(id);
    }

    for (const id of ids) {
      collector.assigneeLinks.push({ taskId, valueId: id });
    }
  }

  if (collector.links.epics) {
    collector.epicTaskIds.push(taskId);

    for (const name of row.epics) {
      const id = collector.epicIdByName.get(normalizeLookupKey(name));
      if (id) collector.epicLinks.push({ taskId, valueId: id });
    }
  }

  if (collector.links.labels) {
    collector.labelTaskIds.push(taskId);

    for (const name of row.labels) {
      collector.labelLinks.push({
        taskId,
        name,
        color: labelColor(name, collector.lookups),
        workspaceId: collector.workspaceId,
      });
    }
  }
}

/**
 * El color de una etiqueta. Se hereda el de la etiqueta del espacio que ya se
 * llame asi; si no la hay, se elige de la paleta por el nombre, para que la
 * misma etiqueta salga siempre del mismo color en vez de al azar.
 */
function labelColor(name: string, lookups: ImportLookups): string {
  const known = lookups.labelColorByName.get(normalizeLookupKey(name));
  if (known) return known;

  let hash = 0;
  for (const character of name) {
    hash = (hash * 31 + (character.codePointAt(0) ?? 0)) % 2147483647;
  }

  return LABEL_PALETTE[hash % LABEL_PALETTE.length] as string;
}
