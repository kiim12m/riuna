import { and, eq } from "drizzle-orm";
import db from "../database";
import { projectTable, taskTable } from "../database/schema";
import { getFieldDefinitionsForProject } from "../field/controllers/get-field-definitions";
import { buildFilter } from "../view/build-filter";
import { buildFieldRegistry } from "../view/field-registry";
import type { EditableCondition } from "../view/filter-schema";
import { filterToSql } from "../view/filter-to-sql";
import { getWorkspaceFieldRegistry } from "../view/workspace-registry";

/**
 * Si la tarea cumple las condiciones de una regla: el mismo motor que filtra
 * las vistas, preguntado por una sola tarea por su clave primaria. Asi la
 * semantica es la de la barra de filtros, campos personalizados incluidos.
 *
 * Lanza `FilterError` si la condicion ya no compila —un campo borrado despues
 * de guardar la regla—; quien llama lo apunta como ejecucion fallida.
 */
export async function taskMatchesConditions({
  taskId,
  workspaceId,
  projectId,
  conditions,
}: {
  taskId: string;
  workspaceId: string;
  /** El de la regla: nulo usa el registro del espacio. */
  projectId: string | null;
  conditions: readonly EditableCondition[];
}): Promise<boolean> {
  const filter = buildFilter(conditions);
  if (!filter) return true;

  const registry = projectId
    ? buildFieldRegistry(
        await getFieldDefinitionsForProject(workspaceId, projectId, true),
      )
    : await getWorkspaceFieldRegistry(workspaceId);
  const compiled = filterToSql(filter, registry);

  const [row] = await db
    .select({ id: taskTable.id })
    .from(taskTable)
    .innerJoin(projectTable, eq(taskTable.projectId, projectTable.id))
    .where(and(eq(taskTable.id, taskId), compiled))
    .limit(1);

  return Boolean(row);
}
