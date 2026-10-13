import { asc, eq, inArray, lte } from "drizzle-orm";
import db from "../database";
import { projectTable, taskReminderTable, taskTable } from "../database/schema";
import createNotification from "../notification/controllers/create-notification";
import { filterAssignableUsers } from "../utils/assert-assignable-user";
import { log } from "../utils/log";

const BATCH = 200;

/**
 * Manda los recordatorios que ya tocan (ADR 077). Cada fila se **reclama
 * borrandola** con `FOR UPDATE SKIP LOCKED`: dos instancias a la vez se
 * reparten las filas en vez de avisar dos veces, sin arrendamiento. Un
 * recordatorio que tocaba con la API parada sale en la primera vuelta.
 */
export async function sendDueTaskReminders(
  now = new Date(),
): Promise<{ degraded: boolean; sent: number }> {
  const due = db
    .select({ id: taskReminderTable.id })
    .from(taskReminderTable)
    .where(lte(taskReminderTable.remindAt, now))
    .orderBy(asc(taskReminderTable.remindAt))
    .limit(BATCH)
    .for("update", { skipLocked: true });

  const claimed = await db
    .delete(taskReminderTable)
    .where(inArray(taskReminderTable.id, due))
    .returning({
      taskId: taskReminderTable.taskId,
      userId: taskReminderTable.userId,
      remindAt: taskReminderTable.remindAt,
      note: taskReminderTable.note,
    });
  if (claimed.length === 0) return { degraded: false, sent: 0 };

  const tasks = await db
    .select({
      id: taskTable.id,
      title: taskTable.title,
      projectId: taskTable.projectId,
      workspaceId: projectTable.workspaceId,
    })
    .from(taskTable)
    .innerJoin(projectTable, eq(taskTable.projectId, projectTable.id))
    .where(
      inArray(
        taskTable.id,
        claimed.map((row) => row.taskId),
      ),
    );
  const taskById = new Map(tasks.map((task) => [task.id, task]));

  let degraded = false;
  let sent = 0;
  for (const reminder of claimed) {
    const task = taskById.get(reminder.taskId);
    if (!task) continue;
    try {
      // Quien se fue del espacio ya no ve la tarea: su recordatorio se pierde.
      const members = await filterAssignableUsers(
        [reminder.userId],
        task.workspaceId,
      );
      if (!members.has(reminder.userId)) continue;

      await createNotification({
        userId: reminder.userId,
        type: "task_reminder",
        // El proyecto y el espacio, para que pinchar el aviso abra la tarea.
        eventData: {
          taskTitle: task.title,
          note: reminder.note,
          remindAt: reminder.remindAt.toISOString(),
          projectId: task.projectId,
          workspaceId: task.workspaceId,
        },
        resourceId: task.id,
        resourceType: "task",
      });
      sent += 1;
    } catch (error) {
      degraded = true;
      log.error("Failed to send task reminder", {
        taskId: reminder.taskId,
        userId: reminder.userId,
        error,
      });
    }
  }

  return { degraded, sent };
}
