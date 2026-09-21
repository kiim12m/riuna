import { eq, isNull, ne, type SQL } from "drizzle-orm";
import { projectTable, taskTable } from "../database/schema";
import { type PersonalScope, personalScopeCondition } from "../my-work/scope";
import type { FieldRegistry } from "./field-registry";
import { type FilterNode, filterToSql } from "./filter-to-sql";

export type WorkspaceTaskQuery = {
  workspaceId: string;
  /** Quien mira, para los ambitos personales. */
  userId: string;
  /** Nulo para mirar todo el espacio de trabajo. */
  projectId?: string | null;
  /** Sin ambito, todas las tareas del espacio. */
  scope?: PersonalScope;
  filter: FilterNode | null;
  registry: FieldRegistry;
};

/**
 * El ambito de una lectura de tareas que cruza proyectos.
 *
 * Lo comparten las tres superficies que leen el espacio entero: la tabla de un
 * widget (`dashboard/top-tasks.ts`), los agregados de los paneles y los
 * objetivos (`dashboard/aggregate.ts`) y las vistas personales
 * (`my-work/controllers/search-tasks.ts`). Eran la misma docena de lineas
 * copiada dos veces, y la tercera copia es lo que la traia aqui.
 *
 * **`project.workspace_id` va siempre, incluso con `projectId` puesto.** Es lo
 * que impide que un id de otro espacio se lleve datos ajenos: con la
 * pertenencia comprobada aqui, un id equivocado devuelve cero filas en vez de
 * contenido de otro sitio.
 *
 * Devuelve `null` —y no una lista vacia— cuando el ambito no puede casar nada,
 * que es el caso de quien no pertenece a ningun equipo. Quien llama tiene que
 * tratarlo como "cero filas": devolverlo como ausencia de filtro entregaria el
 * espacio entero.
 *
 * Lanza `FilterError` si el filtro nombra un campo que el registro no ofrece,
 * que es un 400 y no un 500.
 */
export async function workspaceTaskConditions({
  workspaceId,
  userId,
  projectId,
  scope,
  filter,
  registry,
}: WorkspaceTaskQuery): Promise<SQL[] | null> {
  const conditions: SQL[] = [
    eq(projectTable.workspaceId, workspaceId),
    // Un proyecto archivado no aporta trabajo pendiente a nadie, y una tarea
    // archivada no entra en ningun agregado.
    isNull(projectTable.archivedAt),
    ne(taskTable.status, "archived"),
  ];

  if (projectId) {
    conditions.push(eq(taskTable.projectId, projectId));
  }

  if (scope) {
    const personal = await personalScopeCondition(scope, workspaceId, userId);
    if (!personal) return null;
    conditions.push(personal);
  }

  const compiled = filterToSql(filter, registry);
  if (compiled) conditions.push(compiled);

  return conditions;
}
