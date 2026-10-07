import { and, eq } from "drizzle-orm";
import db from "../database";
import { columnTable, projectTable, taskTable } from "../database/schema";

/**
 * Lo que una automatizacion necesita saber de la tarea sobre la que actua:
 * para decidir si le toca (proyecto, espacio, si es «Personal»), para los
 * marcadores de sus textos y para lo que manda fuera. La forma de lo que sale
 * por webhook es la del webhook generico, mas la clave (`DEP-23`).
 */
export async function loadTaskInfo(taskId: string) {
  const [row] = await db
    .select({
      id: taskTable.id,
      title: taskTable.title,
      number: taskTable.number,
      status: taskTable.status,
      priority: taskTable.priority,
      teamId: taskTable.teamId,
      parentId: taskTable.parentId,
      statusName: columnTable.name,
      projectId: projectTable.id,
      projectName: projectTable.name,
      projectSlug: projectTable.slug,
      projectArchivedAt: projectTable.archivedAt,
      projectOwnerUserId: projectTable.ownerUserId,
      workspaceId: projectTable.workspaceId,
    })
    .from(taskTable)
    .innerJoin(projectTable, eq(taskTable.projectId, projectTable.id))
    .leftJoin(
      columnTable,
      and(
        eq(columnTable.id, taskTable.columnId),
        eq(columnTable.projectId, projectTable.id),
      ),
    )
    .where(eq(taskTable.id, taskId))
    .limit(1);

  if (!row) return null;

  const clientUrl = process.env.RIUNA_CLIENT_URL || "http://localhost:5173";
  return {
    ...row,
    statusName: row.statusName ?? row.status,
    key: row.number === null ? null : `${row.projectSlug}-${row.number}`,
    // «Personal» es un proyecto con duena (ADR 051): las reglas de espacio no
    // entran en el.
    isPersonal: row.projectOwnerUserId !== null,
    taskUrl: `${clientUrl}/dashboard/workspace/${row.workspaceId}/project/${row.projectId}/task/${row.id}`,
  };
}

export type TaskInfo = NonNullable<Awaited<ReturnType<typeof loadTaskInfo>>>;

/** El texto de una accion con sus marcadores puestos. */
export function renderTemplate(template: string, task: TaskInfo) {
  const values: Record<string, string> = {
    tarea: task.key ? `${task.key} ${task.title}` : task.title,
    titulo: task.title,
    estado: task.statusName,
    proyecto: task.projectName,
    enlace: task.taskUrl,
  };
  return template.replace(
    /\{(tarea|titulo|estado|proyecto|enlace)\}/g,
    (_, name: string) => values[name] ?? "",
  );
}
