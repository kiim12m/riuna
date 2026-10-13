import { and, eq, sql } from "drizzle-orm";
import db from "../database";
import { taskReminderTable } from "../database/schema";

/**
 * Recordatorios personales en una tarea (ADR 077): uno por persona y tarea,
 * privado, que avisa una sola vez a la hora pedida. No planifica la tarea en
 * el dia de nadie; para eso esta el plan del dia.
 */

export type TaskReminder = {
  remindAt: string;
  note: string | null;
};

function toReminder(row: { remindAt: Date; note: string | null }) {
  return { remindAt: row.remindAt.toISOString(), note: row.note };
}

export async function getReminder(
  taskId: string,
  userId: string,
): Promise<TaskReminder | null> {
  const [row] = await db
    .select({
      remindAt: taskReminderTable.remindAt,
      note: taskReminderTable.note,
    })
    .from(taskReminderTable)
    .where(
      and(
        eq(taskReminderTable.taskId, taskId),
        eq(taskReminderTable.userId, userId),
      ),
    )
    .limit(1);

  return row ? toReminder(row) : null;
}

/**
 * Pone o cambia el recordatorio de esta persona en esta tarea. `note`
 * `undefined` conserva la nota que tuviera.
 */
export async function setReminder({
  taskId,
  userId,
  remindAt,
  note,
}: {
  taskId: string;
  userId: string;
  remindAt: Date;
  note?: string | null;
}): Promise<TaskReminder> {
  const [row] = await db
    .insert(taskReminderTable)
    .values({ taskId, userId, remindAt, note: note ?? null })
    .onConflictDoUpdate({
      target: [taskReminderTable.taskId, taskReminderTable.userId],
      set:
        note === undefined
          ? { remindAt, createdAt: sql`now()` }
          : { remindAt, note, createdAt: sql`now()` },
    })
    .returning({
      remindAt: taskReminderTable.remindAt,
      note: taskReminderTable.note,
    });

  if (!row) throw new Error("Failed to save the reminder");
  return toReminder(row);
}

export async function clearReminder(taskId: string, userId: string) {
  await db
    .delete(taskReminderTable)
    .where(
      and(
        eq(taskReminderTable.taskId, taskId),
        eq(taskReminderTable.userId, userId),
      ),
    );
}
