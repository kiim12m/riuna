import { and, eq, isNull, sql } from "drizzle-orm";
import db from "../database";
import {
  fieldDefinitionTable,
  projectTable,
  taskTable,
} from "../database/schema";
import type { FieldType } from "../field/field-types";
import {
  CUSTOM_FIELD_VALUE_TYPES,
  type FieldRegistry,
} from "../view/field-registry";

/**
 * El progreso de un proyecto como numero, para filtrar la cartera por el: el
 * mismo calculo que la lista (`get-projects.ts`), hechas sobre no archivadas,
 * y en un padre el de su rama (ADR 089). Correlacionado con la fila: una
 * cartera son decenas de proyectos.
 */
const progressExpression = sql<number>`(
  SELECT CASE WHEN count(*) FILTER (WHERE t.status <> 'archived') = 0 THEN 0
    ELSE round(100.0 * count(*) FILTER (WHERE t.completed_at IS NOT NULL)
      / count(*) FILTER (WHERE t.status <> 'archived')) END
  FROM ${taskTable} t
  WHERE t.project_id = ${projectTable.id}
    OR t.project_id IN (
      SELECT c.id FROM ${projectTable} c
      WHERE c.parent_id = ${projectTable.id} AND c.archived_at IS NULL
    )
)`;

// Lo que toda cartera conoce, existan o no campos de proyecto (ADR 088).
const PORTFOLIO_FIELDS: FieldRegistry = {
  name: { kind: "column", column: projectTable.name, valueType: "text" },
  key: { kind: "column", column: projectTable.slug, valueType: "text" },
  health: { kind: "column", column: projectTable.health, valueType: "id" },
  lead: { kind: "column", column: projectTable.leadUserId, valueType: "id" },
  startDate: {
    kind: "column",
    column: projectTable.startDate,
    valueType: "date",
  },
  endDate: { kind: "column", column: projectTable.endDate, valueType: "date" },
  createdAt: {
    kind: "column",
    column: projectTable.createdAt,
    valueType: "date",
  },
  progress: {
    kind: "expression",
    expression: progressExpression,
    valueType: "number",
  },
};

/**
 * El registro de la lista de proyectos: los campos fijos mas los de proyecto
 * del espacio, cada uno bajo `custom.<key>` y leido de `project.custom_fields`.
 * Como el de tareas, es la lista blanca de lo que se puede filtrar.
 */
export async function getProjectFieldRegistry(
  workspaceId: string,
): Promise<FieldRegistry> {
  const definitions = await db
    .select({ key: fieldDefinitionTable.key, type: fieldDefinitionTable.type })
    .from(fieldDefinitionTable)
    .where(
      and(
        eq(fieldDefinitionTable.workspaceId, workspaceId),
        isNull(fieldDefinitionTable.projectId),
        eq(fieldDefinitionTable.entity, "project"),
      ),
    );

  const registry: FieldRegistry = { ...PORTFOLIO_FIELDS };
  for (const definition of definitions) {
    const valueType = CUSTOM_FIELD_VALUE_TYPES[definition.type as FieldType];
    if (!valueType) continue;
    registry[`custom.${definition.key}`] = {
      kind: "json",
      key: definition.key,
      valueType,
      source: projectTable.customFields,
    };
  }
  return registry;
}
