import { inArray, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { taskTable, timeEntryTable } from "../../database/schema";
import { getFieldDefinitionsForProject } from "../../field/controllers/get-field-definitions";
import { type TaskListFilters, taskListWhere } from "../list-conditions";

export type TaskTotals = {
  count: number;
  estimateSeconds: number;
  loggedSeconds: number;
  /** La suma de cada campo numerico o de moneda, por su clave. */
  fields: Record<string, number>;
};

const toNumber = (value: unknown) => {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
};

/**
 * Los totales de la Tabla (ADR 080) sobre **todo** lo que casa con el filtro,
 * con la misma clausula que la lista. Cada tarea cuenta lo suyo —su
 * estimacion, su tiempo, su valor—, no el resumen de su rama: sumar ramas
 * contaria dos veces a las hijas que tambien casan.
 */
export async function getTaskTotals(
  projectId: string,
  options: TaskListFilters,
): Promise<TaskTotals> {
  const project = await db.query.projectTable.findFirst({
    where: (table, { eq }) => eq(table.id, projectId),
    columns: { workspaceId: true },
  });
  if (!project) {
    throw new HTTPException(404, { message: "Project not found" });
  }

  const [where, definitions] = await Promise.all([
    taskListWhere(projectId, project.workspaceId, options),
    getFieldDefinitionsForProject(project.workspaceId, projectId, true),
  ]);
  const numeric = definitions.filter(
    (definition) =>
      definition.type === "number" || definition.type === "currency",
  );

  // Un valor que no es numero en el JSONB (un texto viejo) no suma ni rompe.
  const fieldSums = Object.fromEntries(
    numeric.map((definition, index) => [
      `f${index}`,
      sql<string>`COALESCE(SUM(CASE WHEN jsonb_typeof(${taskTable.customFields} -> ${definition.key}) = 'number' THEN (${taskTable.customFields} ->> ${definition.key})::numeric END), 0)`,
    ]),
  );

  const [row] = await db
    .select({
      count: sql<number>`count(*)::int`,
      estimate: sql<string>`COALESCE(SUM(${taskTable.estimate}), 0)::bigint`,
      ...fieldSums,
    })
    .from(taskTable)
    .where(where);

  const matching = db.select({ id: taskTable.id }).from(taskTable).where(where);
  const [logged] = await db
    .select({
      seconds: sql<string>`COALESCE(SUM(${timeEntryTable.duration}), 0)::bigint`,
    })
    .from(timeEntryTable)
    .where(inArray(timeEntryTable.taskId, matching));

  const values = (row ?? {}) as Record<string, unknown>;
  return {
    count: toNumber(values.count),
    estimateSeconds: toNumber(values.estimate),
    loggedSeconds: toNumber(logged?.seconds),
    fields: Object.fromEntries(
      numeric.map((definition, index) => [
        definition.key,
        toNumber(values[`f${index}`]),
      ]),
    ),
  };
}

/**
 * Los totales de varios proyectos juntos: los de un padre con sus
 * subproyectos (ADR 089). Un campo que solo tiene uno suma solo el suyo.
 */
export function sumTotals(parts: TaskTotals[]): TaskTotals {
  const fields: Record<string, number> = {};
  for (const part of parts) {
    for (const [key, value] of Object.entries(part.fields)) {
      fields[key] = (fields[key] ?? 0) + value;
    }
  }
  return {
    count: parts.reduce((sum, part) => sum + part.count, 0),
    estimateSeconds: parts.reduce((sum, part) => sum + part.estimateSeconds, 0),
    loggedSeconds: parts.reduce((sum, part) => sum + part.loggedSeconds, 0),
    fields,
  };
}
