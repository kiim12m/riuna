import { and, count, eq, isNull, min, sql } from "drizzle-orm";
import db from "../../database";
import { projectTable, taskTable } from "../../database/schema";
import { loadWorkCalendar } from "../../task/schedule/work-calendar";
import { type FilterNode, filterToSql } from "../../view/filter-to-sql";
import { getProjectFieldRegistry } from "../portfolio-registry";
import { projectScheduleWarning } from "../schedule-warning";

type ProjectStatistics = {
  completionPercentage: number;
  totalTasks: number;
  dueDate: Date | null;
  /** El vencimiento mas tardio de sus tareas, para el aviso de la ADR 087. */
  latestDueDate: Date | null;
};

const EMPTY_STATISTICS: ProjectStatistics = {
  completionPercentage: 0,
  totalTasks: 0,
  dueDate: null,
  latestDueDate: null,
};

/**
 * Los proyectos que salen en las listas. Los Personal no (ADR 051): cada
 * persona ve el suyo en lo alto de «Proyectos», que la barra pinta aparte, y
 * esta lista es la que alimenta la barra lateral, los selectores, la
 * administracion y `list_projects` de MCP. Ocultos, no privados: sus tareas
 * siguen en las lecturas de tareas.
 */
function listedProjects(workspaceId: string, includeArchived: boolean) {
  return and(
    eq(projectTable.workspaceId, workspaceId),
    isNull(projectTable.ownerUserId),
    includeArchived ? undefined : isNull(projectTable.archivedAt),
  );
}

async function getProjectStatistics(
  workspaceId: string,
  includeArchived: boolean,
) {
  const statisticsByProject = new Map<string, ProjectStatistics>();

  // Aggregate in the database instead of loading every task row into memory.
  // This endpoint needs three numbers per project; the previous
  // `with: { tasks: true }` made both the query and the response grow linearly
  // with the number of tasks in the workspace. Scoping by workspaceId through
  // a join (rather than an `IN (...projectIds)` list) keeps the statement size
  // constant regardless of how many projects the workspace has.
  const rows = await db
    .select({
      projectId: taskTable.projectId,
      // Archivar no es terminar. La forma anterior —`status in ('done',
      // 'archived')`— contaba como completada una tarea archivada **sin
      // empezar**, asi que limpiar el backlog subia la barra de progreso.
      //
      // Y "hecha" se lee de `completed_at`, que es la definicion unica del
      // producto: `status = 'done'` ignora que las columnas finales son
      // configurables por proyecto. El disparador `task_completed_at` la
      // anula al archivar, asi que las archivadas quedan fuera de las dos
      // cuentas sin pedirlo aparte. Ver la ADR de la Fase 7.
      totalTasks: count(
        sql`case when ${taskTable.status} <> 'archived' then 1 end`,
      ),
      completedTasks: count(
        sql`case when ${taskTable.completedAt} is not null then 1 end`,
      ),
      dueDate: min(taskTable.dueDate),
      // Con `mapWith`, como la columna: crudo llegaria como texto sin zona.
      latestDueDate:
        sql<Date | null>`max(case when ${taskTable.status} <> 'archived' then ${taskTable.dueDate} end)`.mapWith(
          taskTable.dueDate,
        ),
    })
    .from(taskTable)
    .innerJoin(projectTable, eq(taskTable.projectId, projectTable.id))
    .where(listedProjects(workspaceId, includeArchived))
    .groupBy(taskTable.projectId);

  for (const row of rows) {
    const totalTasks = Number(row.totalTasks);
    const completedTasks = Number(row.completedTasks);

    statisticsByProject.set(row.projectId, {
      totalTasks,
      completionPercentage:
        totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
      dueDate: row.dueDate ?? null,
      latestDueDate: row.latestDueDate ?? null,
    });
  }

  return statisticsByProject;
}

async function getProjects(
  workspaceId: string,
  includeArchived = false,
  // El filtro de la cartera (ADR 088), con el motor de las vistas (ADR 014).
  filter?: FilterNode | null,
) {
  const filterSql = filter
    ? filterToSql(filter, await getProjectFieldRegistry(workspaceId))
    : undefined;
  const projects = await db.query.projectTable.findMany({
    where: and(listedProjects(workspaceId, includeArchived), filterSql),
    // `id` is the deterministic tie-breaker: without it, rows sharing both a
    // position and a createdAt come back in an unspecified order.
    orderBy: (project, { asc }) => [
      asc(project.position),
      asc(project.createdAt),
      asc(project.id),
    ],
  });

  const statisticsByProject = await getProjectStatistics(
    workspaceId,
    includeArchived,
  );

  const calendar = await loadWorkCalendar(workspaceId);

  return projects.map((project) => {
    const statistics = statisticsByProject.get(project.id) ?? EMPTY_STATISTICS;
    return {
      ...project,
      statistics,
      schedule: projectScheduleWarning(
        project.endDate,
        statistics.latestDueDate,
        calendar,
      ),
      archivedTasks: [],
      plannedTasks: [],
      columns: [],
    };
  });
}

export default getProjects;
