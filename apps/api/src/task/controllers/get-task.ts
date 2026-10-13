import { eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import {
  epicTable,
  projectTable,
  taskAssigneeTable,
  taskEpicTable,
  taskTable,
  teamTable,
  userTable,
} from "../../database/schema";
import { hasPredecessors } from "../schedule/children";
import { loadWorkCalendar } from "../schedule/work-calendar";
import {
  getTaskSubtreeAggregate,
  serializeAggregate,
  type TaskSubtreeAggregate,
} from "../tree-aggregates";

/**
 * El aviso de desviacion (ADR 083): un padre con fechas propias cuyas
 * subtareas acaban despues de su vencimiento, y cuantos dias laborables.
 */
async function scheduleWarning(
  row: { autoDates: boolean; dueDate: Date | null },
  aggregate: TaskSubtreeAggregate | null,
  workspaceId: string | undefined,
) {
  if (row.autoDates || !aggregate?.dueDate || !row.dueDate || !workspaceId) {
    return null;
  }
  if (aggregate.dueDate <= row.dueDate) return null;
  const calendar = await loadWorkCalendar(workspaceId);
  const nextDay = new Date(row.dueDate);
  nextDay.setDate(nextDay.getDate() + 1);
  return {
    branchDueDate: aggregate.dueDate,
    overflowWorkDays: calendar.workDaysBetween(nextDay, aggregate.dueDate),
  };
}

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
      parentId: taskTable.parentId,
      path: taskTable.path,
      depth: taskTable.depth,
      estimate: taskTable.estimate,
      isMilestone: taskTable.isMilestone,
      autoDates: taskTable.autoDates,
      cycleId: taskTable.cycleId,
      completedAt: taskTable.completedAt,
      customFields: taskTable.customFields,
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

  const row = task[0];

  const [epics, aggregate, project, parent, children] = await Promise.all([
    db
      .select({
        id: epicTable.id,
        name: epicTable.name,
        color: epicTable.color,
      })
      .from(taskEpicTable)
      .innerJoin(epicTable, eq(taskEpicTable.epicId, epicTable.id))
      .where(eq(taskEpicTable.taskId, taskId)),
    getTaskSubtreeAggregate(row.projectId, taskId),
    db
      .select({
        workspaceId: projectTable.workspaceId,
        weightedProgress: projectTable.weightedProgress,
      })
      .from(projectTable)
      .where(eq(projectTable.id, row.projectId))
      .limit(1)
      .then((rows) => rows[0]),
    row.parentId
      ? db
          .select({
            id: taskTable.id,
            title: taskTable.title,
            number: taskTable.number,
            status: taskTable.status,
          })
          .from(taskTable)
          .where(eq(taskTable.id, row.parentId))
          .limit(1)
      : Promise.resolve([]),
    // Solo las hijas directas: el panel de subtareas del detalle enseña un
    // nivel y se baja abriendo la hija, no desplegando el arbol entero dentro
    // de un panel lateral.
    db
      .select({
        id: taskTable.id,
        title: taskTable.title,
        number: taskTable.number,
        status: taskTable.status,
        priority: taskTable.priority,
        position: taskTable.position,
        projectId: taskTable.projectId,
        userId: taskTable.userId,
        assigneeName: userTable.name,
        assigneeImage: userTable.image,
      })
      .from(taskTable)
      .leftJoin(userTable, eq(taskTable.userId, userTable.id))
      .where(eq(taskTable.parentId, taskId))
      .orderBy(taskTable.position),
  ]);

  return {
    ...row,
    assignees,
    epics,
    children,
    parent: parent[0] ?? null,
    subtree: serializeAggregate(
      aggregate ?? undefined,
      { startDate: row.startDate, dueDate: row.dueDate },
      project?.weightedProgress ?? false,
    ),
    schedule: await scheduleWarning(row, aggregate, project?.workspaceId),
    hasPredecessors: await hasPredecessors(taskId),
  };
}

export default getTask;
