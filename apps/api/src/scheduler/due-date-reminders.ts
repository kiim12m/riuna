import { and, between, eq, isNull, ne, or, sql } from "drizzle-orm";
import db from "../database";
import {
  taskAssigneeTable,
  taskReminderSentTable,
  taskTable,
  userNotificationPreferenceTable,
} from "../database/schema";
import createNotification from "../notification/controllers/create-notification";
import {
  MAX_REMINDER_LEAD_MINUTES,
  REMINDER_WINDOW_MINUTES,
} from "./reminder-timing";

type ReminderType = "configured_before" | "overdue";

const MINUTE_MS = 60 * 1000;

function buildWindows(now: Date) {
  const nowMs = now.getTime();

  return {
    upcoming: {
      start: new Date(nowMs - REMINDER_WINDOW_MINUTES * MINUTE_MS),
      end: now,
      type: "configured_before" as ReminderType,
      notificationType: "due_date_reminder" as const,
    },
    overdue: {
      end: now,
      start: new Date(nowMs - 10 * MINUTE_MS),
      type: "overdue" as ReminderType,
      notificationType: "task_overdue" as const,
    },
  };
}

/**
 * El registro de "ya avisado" va por persona (ADR 050): `configured_before:<id>`
 * u `overdue:<id>`, el mismo patron que `generic_webhook:<id>` en
 * `project-webhook-reminders.ts`.
 */
function sentKey(reminderType: ReminderType, userId: string) {
  return `${reminderType}:${userId}`;
}

/**
 * Una fila por **asignado** -`task_assignee`, que incluye al responsable
 * principal (ADR 010)-, no por tarea: hasta la ADR 050 solo avisaba a
 * `task.assignee_id`, y quien estaba asignado ademas no se enteraba de nada.
 * Cada persona con su propia antelacion y su propio interruptor.
 */
async function getTasksNeedingReminder(
  windowStart: Date,
  windowEnd: Date,
  reminderType: ReminderType,
) {
  // Un prefiltro sargable sobre `due_date`: la antelacion de cada persona
  // esta acotada, asi que solo pueden tocar ahora los vencimientos de esta
  // franja. Sin el, la condicion con la antelacion por persona obligaba a
  // mirar todas las tareas con vencimiento.
  const dueRange =
    reminderType === "configured_before"
      ? between(
          taskTable.dueDate,
          windowStart,
          new Date(windowEnd.getTime() + MAX_REMINDER_LEAD_MINUTES * MINUTE_MS),
        )
      : between(taskTable.dueDate, windowStart, windowEnd);

  const results = await db
    .select({
      id: taskTable.id,
      title: taskTable.title,
      userId: taskAssigneeTable.userId,
      dueDate: taskTable.dueDate,
      projectId: taskTable.projectId,
      leadTimeMinutes:
        userNotificationPreferenceTable.dueDateReminderLeadTimeMinutes,
    })
    .from(taskAssigneeTable)
    .innerJoin(taskTable, eq(taskTable.id, taskAssigneeTable.taskId))
    .leftJoin(
      userNotificationPreferenceTable,
      eq(userNotificationPreferenceTable.userId, taskAssigneeTable.userId),
    )
    .leftJoin(
      taskReminderSentTable,
      and(
        eq(taskReminderSentTable.taskId, taskTable.id),
        eq(
          taskReminderSentTable.reminderType,
          sql`${reminderType} || ':' || ${taskAssigneeTable.userId}`,
        ),
      ),
    )
    .where(
      and(
        dueRange,
        reminderType === "configured_before"
          ? sql`${taskTable.dueDate} - (COALESCE(${userNotificationPreferenceTable.dueDateReminderLeadTimeMinutes}, 1440) * interval '1 minute') BETWEEN ${windowStart.toISOString()} AND ${windowEnd.toISOString()}`
          : undefined,
        isNull(taskReminderSentTable.id),
        or(
          isNull(userNotificationPreferenceTable.id),
          eq(userNotificationPreferenceTable.dueDateReminderEnabled, true),
        ),
        // "Hecha" es `completed_at` (ADR 030). Y lo archivado tampoco avisa:
        // archivar borra `completed_at`, y sin columna la comprobacion
        // anterior por `column.is_final` lo dejaba pasar.
        isNull(taskTable.completedAt),
        ne(taskTable.status, "archived"),
      ),
    );

  return results;
}

async function processReminder(
  task: {
    id: string;
    title: string;
    userId: string;
    dueDate: Date | null;
    projectId: string;
    leadTimeMinutes: number | null;
  },
  reminderType: ReminderType,
  notificationType: "due_date_reminder" | "task_overdue",
) {
  // Insert sent record first; if it already exists, skip notification
  try {
    const [inserted] = await db
      .insert(taskReminderSentTable)
      .values({
        taskId: task.id,
        reminderType: sentKey(reminderType, task.userId),
      })
      .onConflictDoNothing({
        target: [
          taskReminderSentTable.taskId,
          taskReminderSentTable.reminderType,
        ],
      })
      .returning();

    if (!inserted) return;
  } catch (error) {
    console.error("Failed to record due date reminder", {
      taskId: task.id,
      userId: task.userId,
      reminderType,
      error,
    });
    return;
  }

  await createNotification({
    userId: task.userId,
    type: notificationType,
    eventData: {
      taskTitle: task.title,
      reminderType,
      leadTimeMinutes: task.leadTimeMinutes ?? 1440,
      dueDate: task.dueDate?.toISOString() ?? null,
    },
    resourceId: task.id,
    resourceType: "task",
  });
}

export async function checkDueDateReminders(): Promise<{ degraded: boolean }> {
  const now = new Date();
  const windows = buildWindows(now);
  let degraded = false;

  for (const window of Object.values(windows)) {
    try {
      const tasks = await getTasksNeedingReminder(
        window.start,
        window.end,
        window.type,
      );

      for (const task of tasks) {
        try {
          await processReminder(task, window.type, window.notificationType);
        } catch (error) {
          degraded = true;
          console.error("Failed to process due date reminder", {
            taskId: task.id,
            reminderType: window.type,
            error,
          });
        }
      }
    } catch (error) {
      degraded = true;
      console.error("Failed to query tasks for due date reminders", {
        reminderType: window.type,
        error,
      });
    }
  }

  return { degraded };
}
