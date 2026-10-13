import { and, eq, exists, gte, isNull, lte, type SQL, sql } from "drizzle-orm";
import db from "../database";
import { taskEpicTable, taskTable } from "../database/schema";
import { getFieldDefinitionsForProject } from "../field/controllers/get-field-definitions";
import { buildFieldRegistry } from "../view/field-registry";
import { type FilterNode, filterToSql } from "../view/filter-to-sql";

export type TaskListFilters = {
  assigneeId?: string;
  epicId?: string;
  rootsOnly?: boolean;
  /**
   * Que hace el filtro con la jerarquia.
   *
   * - `matching`: solo las tareas que casan. Una rama cuyo padre casa pierde
   *   las hijas que no casan, que es lo que pasa hoy.
   * - `roots`: solo las tareas de primer nivel que casan.
   * - `withDescendants`: las que casan mas todo lo que cuelga de ellas, para
   *   ver la rama entera de lo que el filtro ha encontrado.
   */
  treeScope?: "matching" | "roots" | "withDescendants";
  dueAfter?: string;
  dueBefore?: string;
  priority?: string;
  status?: string;
  // El arbol de filtros del motor de vistas. Convive con las opciones sueltas
  // de arriba en vez de sustituirlas: tablero, lista y backlog siguen
  // mandando las suyas, y migrarlas es trabajo de esta misma fase. Las dos se
  // combinan con AND, asi que un filtro nuevo nunca ensancha uno viejo.
  filter?: FilterNode | null;
};

/**
 * El arbol de filtros de una vista, compilado para las tareas de un proyecto.
 *
 * El registro se construye con las definiciones que aplican al proyecto, que
 * es lo que hace que `custom.presupuesto` exista como campo filtrable aqui y
 * no en un proyecto que no lo haya definido.
 *
 * Se incluyen las archivadas. Archivar una definicion la retira de los
 * formularios sin borrar los valores, que siguen en el JSONB y siguen siendo
 * filtrables. Excluyendolas, archivar un campo convertia toda vista guardada
 * que lo filtrase en un 400 **del listado entero** —no se caia la condicion,
 * se caia la consulta— y dejaba la pantalla en blanco para todo el equipo,
 * sin decir que campo sobraba.
 */
export async function compileTaskFilter(
  projectId: string,
  workspaceId: string,
  filter: FilterNode,
) {
  const definitions = await getFieldDefinitionsForProject(
    workspaceId,
    projectId,
    true,
  );
  return filterToSql(filter, buildFieldRegistry(definitions));
}

/**
 * La clausula WHERE de la lista de tareas de un proyecto. La comparten la
 * lista y sus totales (ADR 080), para que la fila de totales sume exactamente
 * las tareas que la Tabla pinta.
 */
export async function taskListWhere(
  projectId: string,
  workspaceId: string,
  options: TaskListFilters,
): Promise<SQL | undefined> {
  const conditions: SQL[] = [eq(taskTable.projectId, projectId)];

  if (options.status) {
    conditions.push(eq(taskTable.status, options.status));
  }

  if (options.priority) {
    conditions.push(eq(taskTable.priority, options.priority));
  }

  if (options.assigneeId) {
    conditions.push(eq(taskTable.userId, options.assigneeId));
  }

  if (options.dueBefore) {
    conditions.push(lte(taskTable.dueDate, new Date(options.dueBefore)));
  }

  if (options.dueAfter) {
    conditions.push(gte(taskTable.dueDate, new Date(options.dueAfter)));
  }

  // Filtrar por epica en la propia consulta y no despues: una vista paginada
  // que filtrase en memoria devolveria paginas incompletas.
  if (options.epicId) {
    conditions.push(
      exists(
        db
          .select({ one: sql`1` })
          .from(taskEpicTable)
          .where(
            and(
              eq(taskEpicTable.taskId, taskTable.id),
              eq(taskEpicTable.epicId, options.epicId),
            ),
          ),
      ),
    );
  }

  if (options.rootsOnly || options.treeScope === "roots") {
    conditions.push(isNull(taskTable.parentId));
  }

  if (options.filter) {
    const filterSql = await compileTaskFilter(
      projectId,
      workspaceId,
      options.filter,
    );

    if (filterSql) {
      if (options.treeScope === "withDescendants") {
        // "Lo que casa, mas su rama".
        //
        // El filtro se evalua **una vez**, en su propia subconsulta cuyo FROM
        // es `task`: alli `"task"."x"` se resuelve contra esa copia y no contra
        // la de fuera.
        //
        // La pertenencia a la rama se resuelve por igualdad de ids y no por
        // prefijo de `path`: los ancestros de una tarea son exactamente los
        // segmentos de su propio camino, y los ids son unicos. La forma
        // anterior —un `EXISTS` correlacionado dentro de un `OR`— Postgres no
        // la puede convertir en semi-join, asi que la reejecutaba por cada fila
        // candidata, con un `LIKE` de patron no constante dentro: medido sobre
        // 10.000 tareas, el subplan corria 9.519 veces y la consulta tardaba
        // **28 segundos**. Asi son 41 ms, y devuelve exactamente el mismo
        // conjunto.
        conditions.push(
          sql`${taskTable.id} IN (
            SELECT d."id" FROM ${taskTable} d
            CROSS JOIN LATERAL unnest(
              string_to_array(trim(both '/' from d."path"), '/')
            ) AS ancestor(id)
            WHERE d."project_id" = ${projectId}
              AND ancestor.id IN (
                SELECT id FROM ${taskTable}
                WHERE ${taskTable.projectId} = ${projectId} AND ${filterSql}
              )
          )`,
        );
      } else {
        conditions.push(filterSql);
      }
    }
  }

  return and(...conditions);
}
