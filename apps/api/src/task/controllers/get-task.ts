import { eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import {
  taskAssigneeTable,
  taskTable,
  teamTable,
  userTable,
} from "../../database/schema";

async function getTask(taskId: string) {
  const task = await db
    .select({
      id: taskTable.id,
      title: taskTable.title,
      number: taskTable.number,
      description: taskTable.description,
      status: taskTable.status,
      priority: taskTable.priority,
      startDate: taskTable.startDate,
      dueDate: taskTable.dueDate,
      position: taskTable.position,
      createdAt: taskTable.createdAt,
      userId: taskTable.userId,
      assigneeName: userTable.name,
      assigneeId: userTable.id,
      teamId: taskTable.teamId,
      teamName: teamTable.name,
      projectId: taskTable.projectId,
    })
    .from(taskTable)
    .leftJoin(userTable, eq(taskTable.userId, userTable.id))
    .leftJoin(teamTable, eq(taskTable.teamId, teamTable.id))
    .where(eq(taskTable.id, taskId))
    .limit(1);

  if (!task.length || !task[0]) {
    throw new HTTPException(404, {
      message: "Task not found",
    });
  }

  // El conjunto completo de asignados, en orden de asignacion. Incluye al
  // responsable principal, asi que la interfaz no tiene que unirlo con
  // assigneeId para pintar la lista.
  const assignees = await db
    .select({
      id: userTable.id,
      name: userTable.name,
      image: userTable.image,
    })
    .from(taskAssigneeTable)
    .innerJoin(userTable, eq(taskAssigneeTable.userId, userTable.id))
    .where(eq(taskAssigneeTable.taskId, taskId))
    .orderBy(taskAssigneeTable.createdAt);

  return { ...task[0], assignees };
}

export default getTask;
