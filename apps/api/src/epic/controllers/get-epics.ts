import { and, asc, eq, isNull, sql } from "drizzle-orm";
import db from "../../database";
import { columnTable, epicTable, taskEpicTable } from "../../database/schema";

// Cada epica llega con su recuento para que la interfaz no tenga que cruzar
// la lista de tareas para pintar "7 de 12".
export async function getEpics(projectId: string, includeArchived = false) {
  const finalSlugs = await db
    .select({ slug: columnTable.slug })
    .from(columnTable)
    .where(
      and(eq(columnTable.projectId, projectId), eq(columnTable.isFinal, true)),
    );

  const doneSlugs = finalSlugs.map((c) => c.slug);
  const doneList =
    doneSlugs.length > 0
      ? sql.join(
          doneSlugs.map((slug) => sql`${slug}`),
          sql`, `,
        )
      : sql`'done'`;

  return db
    .select({
      id: epicTable.id,
      projectId: epicTable.projectId,
      name: epicTable.name,
      description: epicTable.description,
      color: epicTable.color,
      position: epicTable.position,
      startDate: epicTable.startDate,
      dueDate: epicTable.dueDate,
      createdAt: epicTable.createdAt,
      archivedAt: epicTable.archivedAt,
      // La columna de la epica se escribe cualificada a mano: dentro de una
      // subconsulta, drizzle la interpolaria como `"id"` a secas y ahi dentro
      // eso ya no apunta a la fila de fuera.
      taskCount: sql<number>`(
        SELECT COUNT(*)::int FROM "task_epic" te
        JOIN "task" t ON t."id" = te."task_id"
        WHERE te."epic_id" = "epic"."id" AND t."status" <> 'archived'
      )`,
      doneTaskCount: sql<number>`(
        SELECT COUNT(*)::int FROM "task_epic" te
        JOIN "task" t ON t."id" = te."task_id"
        WHERE te."epic_id" = "epic"."id" AND t."status" IN (${doneList})
      )`,
    })
    .from(epicTable)
    .where(
      includeArchived
        ? eq(epicTable.projectId, projectId)
        : and(eq(epicTable.projectId, projectId), isNull(epicTable.archivedAt)),
    )
    .orderBy(asc(epicTable.position), asc(epicTable.createdAt));
}

/** Epicas de cada tarea del proyecto, para adjuntarlas a la lista de tareas. */
export async function getEpicsByTask(projectId: string) {
  const rows = await db
    .select({
      taskId: taskEpicTable.taskId,
      id: epicTable.id,
      name: epicTable.name,
      color: epicTable.color,
    })
    .from(taskEpicTable)
    .innerJoin(epicTable, eq(taskEpicTable.epicId, epicTable.id))
    .where(eq(epicTable.projectId, projectId))
    .orderBy(asc(epicTable.position));

  const byTask = new Map<
    string,
    Array<{ id: string; name: string; color: string | null }>
  >();

  for (const row of rows) {
    const list = byTask.get(row.taskId) ?? [];
    list.push({ id: row.id, name: row.name, color: row.color });
    byTask.set(row.taskId, list);
  }

  return byTask;
}

export default getEpics;
