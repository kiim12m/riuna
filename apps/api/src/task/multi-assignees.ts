import { eq, gt, sql } from "drizzle-orm";
import db from "../database";
import { taskAssigneeTable, taskTable, userTable } from "../database/schema";

export type TaskAssignee = {
  id: string;
  name: string;
  image: string | null;
};

/**
 * Los asignados de las tareas de un proyecto que tienen **mas de uno**, en
 * orden de asignacion (ADR 010). El resto no hace falta: con un solo asignado
 * el conjunto es el responsable principal, que el listado ya lee con la propia
 * tarea. Asi la carga es proporcional a lo que se reparte entre varias
 * personas y no al proyecto entero.
 *
 * Se acota por proyecto con una union y no con `IN (…ids)`: un proyecto de
 * decenas de miles de tareas pasaria del limite de parametros del protocolo.
 */
export async function getMultiAssigneesByTask(projectId: string) {
  const counted = db
    .select({
      taskId: taskAssigneeTable.taskId,
      userId: taskAssigneeTable.userId,
      createdAt: taskAssigneeTable.createdAt,
      total:
        sql<number>`count(*) over (partition by ${taskAssigneeTable.taskId})`.as(
          "total",
        ),
    })
    .from(taskAssigneeTable)
    .innerJoin(taskTable, eq(taskTable.id, taskAssigneeTable.taskId))
    .where(eq(taskTable.projectId, projectId))
    .as("counted");

  const rows = await db
    .select({
      taskId: counted.taskId,
      id: userTable.id,
      name: userTable.name,
      image: userTable.image,
    })
    .from(counted)
    .innerJoin(userTable, eq(userTable.id, counted.userId))
    .where(gt(counted.total, 1))
    .orderBy(counted.taskId, counted.createdAt);

  const byTask = new Map<string, TaskAssignee[]>();
  for (const { taskId, ...assignee } of rows) {
    const list = byTask.get(taskId) ?? [];
    list.push(assignee);
    byTask.set(taskId, list);
  }
  return byTask;
}
