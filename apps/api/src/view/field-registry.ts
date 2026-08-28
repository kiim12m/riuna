import { type SQL, sql } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { taskTable } from "../database/schema";
import type { FieldType } from "../field/field-types";

// El tipo de valor decide que operadores tienen sentido y como se compara.
// No es el tipo del campo personalizado: varios de aquellos comparten forma de
// comparacion —`currency` se compara como `number`, `url` como `text`—.
export type ValueType = "text" | "number" | "date" | "boolean" | "id";

export type FieldDescriptor =
  // Una columna real de `task`.
  | { kind: "column"; column: PgColumn; valueType: ValueType }
  // Una expresion calculada, como la prioridad convertida a rango ordenable.
  | { kind: "expression"; expression: SQL; valueType: ValueType }
  // Una clave dentro de `task.custom_fields`.
  | { kind: "json"; key: string; valueType: ValueType }
  // Pertenencia, que se resuelve con un EXISTS y no con una comparacion:
  // epicas, etiquetas y asignados adicionales.
  | { kind: "membership"; relation: "epic" | "label" | "assignee" };

export type FieldRegistry = Record<string, FieldDescriptor>;

export const priorityRankExpression = sql<number>`CASE
  WHEN ${taskTable.priority} = 'urgent' THEN 4
  WHEN ${taskTable.priority} = 'high' THEN 3
  WHEN ${taskTable.priority} = 'medium' THEN 2
  WHEN ${taskTable.priority} = 'low' THEN 1
  ELSE 0
END`;

// Los campos que toda vista conoce, existan o no campos personalizados.
export const BUILT_IN_FIELDS: FieldRegistry = {
  title: { kind: "column", column: taskTable.title, valueType: "text" },
  description: {
    kind: "column",
    column: taskTable.description,
    valueType: "text",
  },
  status: { kind: "column", column: taskTable.status, valueType: "id" },
  // La prioridad se filtra por su nombre y se ordena por su rango, asi que
  // vive dos veces: `priority` compara, `priorityRank` ordena.
  priority: { kind: "column", column: taskTable.priority, valueType: "id" },
  priorityRank: {
    kind: "expression",
    expression: priorityRankExpression,
    valueType: "number",
  },
  number: { kind: "column", column: taskTable.number, valueType: "number" },
  position: { kind: "column", column: taskTable.position, valueType: "number" },
  estimate: { kind: "column", column: taskTable.estimate, valueType: "number" },
  startDate: { kind: "column", column: taskTable.startDate, valueType: "date" },
  dueDate: { kind: "column", column: taskTable.dueDate, valueType: "date" },
  createdAt: { kind: "column", column: taskTable.createdAt, valueType: "date" },
  updatedAt: { kind: "column", column: taskTable.updatedAt, valueType: "date" },
  assignee: { kind: "column", column: taskTable.userId, valueType: "id" },
  team: { kind: "column", column: taskTable.teamId, valueType: "id" },
  column: { kind: "column", column: taskTable.columnId, valueType: "id" },
  parent: { kind: "column", column: taskTable.parentId, valueType: "id" },
  depth: { kind: "column", column: taskTable.depth, valueType: "number" },
  epic: { kind: "membership", relation: "epic" },
  label: { kind: "membership", relation: "label" },
  assignees: { kind: "membership", relation: "assignee" },
};

// Como se compara cada tipo de campo personalizado. `relation` no aparece: su
// valor no vive en el JSONB, asi que no se filtra por esta via.
const CUSTOM_FIELD_VALUE_TYPES: Partial<Record<FieldType, ValueType>> = {
  text: "text",
  number: "number",
  currency: "number",
  select: "id",
  multi_select: "id",
  date: "date",
  checkbox: "boolean",
  user: "id",
  url: "text",
};

/**
 * El registro completo para un proyecto: los campos fijos mas los
 * personalizados que apliquen, cada uno bajo `custom.<key>`.
 *
 * El prefijo evita que un campo llamado «status» tape al de verdad, y hace
 * que un nombre de campo que no este en el registro sea un error en vez de
 * llegar a la SQL: el registro es la lista blanca.
 */
export function buildFieldRegistry(
  definitions: Array<{ key: string; type: string }>,
): FieldRegistry {
  const registry: FieldRegistry = { ...BUILT_IN_FIELDS };

  for (const definition of definitions) {
    const valueType = CUSTOM_FIELD_VALUE_TYPES[definition.type as FieldType];
    if (!valueType) continue;

    registry[`custom.${definition.key}`] = {
      kind: "json",
      key: definition.key,
      valueType,
    };
  }

  return registry;
}
