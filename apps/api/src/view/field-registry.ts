import { type SQL, sql } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { taskTable } from "../database/schema";
import type { FieldType } from "../field/field-types";

// El tipo de valor decide que operadores tienen sentido y como se compara.
// No es el tipo del campo personalizado: varios de aquellos comparten forma de
// comparacion —`currency` se compara como `number`, `url` como `text`—.
export type ValueType =
  | "text"
  | "number"
  | "date"
  | "boolean"
  | "id"
  // Una lista de identificadores guardada como array en el JSONB. Necesita
  // tipo propio porque no se compara extrayendo el valor —un array no es una
  // cadena— sino preguntando si contiene lo que se busca.
  | "idList";

export type FieldDescriptor =
  // Una columna real de `task`.
  | { kind: "column"; column: PgColumn; valueType: ValueType }
  // Una expresion calculada, como la prioridad convertida a rango ordenable.
  | { kind: "expression"; expression: SQL; valueType: ValueType }
  // Una clave dentro de `task.custom_fields`.
  | { kind: "json"; key: string; valueType: ValueType }
  // Pertenencia, que se resuelve con un EXISTS y no con una comparacion:
  // epicas, etiquetas, asignados adicionales y observadores.
  | {
      kind: "membership";
      relation: "epic" | "label" | "assignee" | "watcher";
    };

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
  // Sin esto una vista o un widget que cruce proyectos no puede decir "solo
  // este". Es redundante dentro de un proyecto, no incorrecto.
  project: { kind: "column", column: taskTable.projectId, valueType: "id" },
  // "Hecha" con una sola definicion, y la unica que vale en todo el espacio:
  // `status` es un slug por proyecto y la lista de columnas finales crece con
  // proyectos x columnas. El disparador `task_completed_at` calcula "final"
  // con exactamente la misma regla que `getFinalStatuses` reconstruye en
  // TypeScript, respaldo heredado incluido, asi que esto no es una definicion
  // rival: es la misma, materializada. Ver ADR 025 y la ADR de la Fase 7.
  done: {
    kind: "expression",
    expression: sql<boolean>`(${taskTable.completedAt} IS NOT NULL)`,
    valueType: "boolean",
  },
  completedAt: {
    kind: "column",
    column: taskTable.completedAt,
    valueType: "date",
  },
  // Un hito (ADR 082).
  milestone: {
    kind: "column",
    column: taskTable.isMilestone,
    valueType: "boolean",
  },
  column: { kind: "column", column: taskTable.columnId, valueType: "id" },
  parent: { kind: "column", column: taskTable.parentId, valueType: "id" },
  depth: { kind: "column", column: taskTable.depth, valueType: "number" },
  epic: { kind: "membership", relation: "epic" },
  label: { kind: "membership", relation: "label" },
  assignees: { kind: "membership", relation: "assignee" },
  // Quien la observa a proposito (ADR 076). Los asignados ya tienen el suyo.
  watchers: { kind: "membership", relation: "watcher" },
};

// Como se compara cada tipo de campo personalizado. `relation` no aparece: su
// valor no vive en el JSONB, asi que no se filtra por esta via.
export const CUSTOM_FIELD_VALUE_TYPES: Partial<Record<FieldType, ValueType>> = {
  text: "text",
  number: "number",
  currency: "number",
  select: "id",
  multi_select: "idList",
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

/**
 * Los campos que un nombre significa lo mismo en **todo** el espacio de
 * trabajo. Es la respuesta a lo que la ADR 024 dejo aplazado.
 *
 * El compilador siempre fue agnostico del ambito; el registro no lo era. Estos
 * seis nombres son los que cambian de significado segun el proyecto:
 *
 * - `status` compara contra `task.status`, cuyos valores validos son los
 *   `column.slug` de **un** proyecto. `status eq "en-curso"` sale cero, sin
 *   avisar, en un proyecto cuya columna se llama `doing`. Su sustituto entre
 *   proyectos es `done`.
 * - `column` es una clave ajena a las columnas de un proyecto.
 * - `number` y `position` se numeran por proyecto, asi que comparar entre
 *   proyectos no significa nada.
 * - `parent` y `depth` describen un arbol que esta acotado al proyecto.
 *
 * `epic`, `label`, `assignees` y `watchers` **si** se quedan: casan por id o
 * por nombre, y son estables en el espacio.
 */
const PROJECT_SCOPED_FIELDS = [
  "status",
  "column",
  "number",
  "position",
  "parent",
  "depth",
] as const;

/**
 * El registro para un widget o una vista que cruza proyectos.
 *
 * Solo entran campos personalizados **del espacio** (`project_id IS NULL`), y
 * ni siquiera todos: `shadowedKeys` retira los que algun proyecto redefine con
 * **otro tipo**. Ese caso es el peligroso y no es un error visible —
 * `get-field-definitions.ts` deja que la definicion del proyecto eclipse a la
 * del espacio, asi que un `presupuesto` que aqui se compila como numero leeria
 * un texto en el JSONB de ese proyecto, `jsonb_typeof` no casaria y esas
 * tareas **desapareceran del recuento en silencio**. No un 400: un numero
 * equivocado. Para una superficie que informa, "el campo no se ofrece" es el
 * modo de fallo correcto.
 */
export function buildWorkspaceFieldRegistry(
  workspaceDefinitions: Array<{ key: string; type: string }>,
  shadowedKeys: ReadonlySet<string> = new Set(),
): FieldRegistry {
  const registry: FieldRegistry = { ...BUILT_IN_FIELDS };

  for (const field of PROJECT_SCOPED_FIELDS) {
    delete registry[field];
  }

  for (const definition of workspaceDefinitions) {
    if (shadowedKeys.has(definition.key)) continue;

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
