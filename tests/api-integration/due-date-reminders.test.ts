import { and, eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import db, { schema } from "../../apps/api/src/database";
import { checkDueDateReminders } from "../../apps/api/src/scheduler/due-date-reminders";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
  taskTreeValues,
} from "./helpers/fixtures";

const MINUTE = 60_000;

/**
 * El recordatorio de vencimiento (ADR 050): por asignado, con la antelacion de
 * cada uno, y rearmado por un disparador cuando la fecha cambia por cualquier
 * camino. Antes solo avisaba al responsable principal, y solo se rearmaba
 * desde `PUT /task/due-date/:id`.
 */
describe("due-date reminders", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  async function setup() {
    const owner = await createWorkspaceMember({ userName: "Ana" });
    const other = await createWorkspaceMember({ userName: "Beto" });
    const fixture = await createProjectFixture({
      workspaceId: owner.workspace.id,
    });
    return { owner: owner.user, other: other.user, fixture };
  }

  let number = 0;
  async function createTask(
    projectId: string,
    columnId: string,
    overrides: Partial<typeof schema.taskTable.$inferInsert>,
    assignees: string[],
  ) {
    number += 1;
    const [task] = await db
      .insert(schema.taskTable)
      .values({
        ...taskTreeValues(),
        projectId,
        columnId,
        title: "Entregar planos",
        status: "to-do",
        priority: "medium",
        number,
        position: number,
        userId: assignees[0] ?? null,
        ...overrides,
      })
      .returning();
    if (!task) throw new Error("Failed to seed task");
    for (const userId of assignees) {
      await db
        .insert(schema.taskAssigneeTable)
        .values({ taskId: task.id, userId });
    }
    return task;
  }

  async function notificationsFor(taskId: string) {
    const rows = await db
      .select({
        userId: schema.notificationTable.userId,
        type: schema.notificationTable.type,
      })
      .from(schema.notificationTable)
      .where(eq(schema.notificationTable.resourceId, taskId));
    return rows.map((row) => `${row.type}:${row.userId}`).sort();
  }

  it("reminds every assignee, once", async () => {
    const { owner, other, fixture } = await setup();
    // Dentro de la ventana del aviso por defecto: un dia antes, hace 2 min.
    const task = await createTask(
      fixture.project.id,
      fixture.columns.todo.id,
      { dueDate: new Date(Date.now() + 1440 * MINUTE - 2 * MINUTE) },
      [owner.id, other.id],
    );

    await checkDueDateReminders();
    await checkDueDateReminders();

    expect(await notificationsFor(task.id)).toEqual(
      [`due_date_reminder:${owner.id}`, `due_date_reminder:${other.id}`].sort(),
    );
  });

  it("uses each person's own lead time", async () => {
    const { owner, other, fixture } = await setup();
    await db.insert(schema.userNotificationPreferenceTable).values({
      userId: other.id,
      dueDateReminderEnabled: true,
      dueDateReminderLeadTimeMinutes: 60,
    });
    const task = await createTask(
      fixture.project.id,
      fixture.columns.todo.id,
      { dueDate: new Date(Date.now() + 60 * MINUTE - 2 * MINUTE) },
      [owner.id, other.id],
    );

    await checkDueDateReminders();

    // Ana avisa con un dia de antelacion -ya paso-; Beto, con una hora.
    expect(await notificationsFor(task.id)).toEqual([
      `due_date_reminder:${other.id}`,
    ]);
  });

  it("sends the overdue notice to every assignee", async () => {
    const { owner, other, fixture } = await setup();
    const task = await createTask(
      fixture.project.id,
      fixture.columns.todo.id,
      { dueDate: new Date(Date.now() - 3 * MINUTE) },
      [owner.id, other.id],
    );

    await checkDueDateReminders();

    expect(await notificationsFor(task.id)).toEqual(
      [`task_overdue:${owner.id}`, `task_overdue:${other.id}`].sort(),
    );
  });

  it("does not remind about done or archived tasks", async () => {
    const { owner, fixture } = await setup();
    const dueDate = new Date(Date.now() - 3 * MINUTE);
    const done = await createTask(
      fixture.project.id,
      fixture.columns.done.id,
      { status: fixture.columns.done.slug, completedAt: new Date(), dueDate },
      [owner.id],
    );
    const archived = await createTask(
      fixture.project.id,
      fixture.columns.todo.id,
      { status: "archived", dueDate },
      [owner.id],
    );

    await checkDueDateReminders();

    expect(await notificationsFor(done.id)).toEqual([]);
    expect(await notificationsFor(archived.id)).toEqual([]);
  });

  // El disparador `task_rearm_due_reminders`: cualquier escritura que cambie
  // `due_date` -aqui, un UPDATE directo, como el de la edicion en bloque o la
  // importacion- vuelve a armar los avisos. Una que no la cambia, no.
  it("re-arms reminders whenever the due date changes, by any path", async () => {
    const { owner, fixture } = await setup();
    const task = await createTask(
      fixture.project.id,
      fixture.columns.todo.id,
      { dueDate: new Date(Date.now() - 3 * MINUTE) },
      [owner.id],
    );
    await checkDueDateReminders();

    const sentFor = async () =>
      (
        await db
          .select({ type: schema.taskReminderSentTable.reminderType })
          .from(schema.taskReminderSentTable)
          .where(eq(schema.taskReminderSentTable.taskId, task.id))
      ).map((row) => row.type);

    expect(await sentFor()).toEqual([`overdue:${owner.id}`]);

    await db
      .update(schema.taskTable)
      .set({ title: "Entregar planos revisados" })
      .where(eq(schema.taskTable.id, task.id));
    expect(await sentFor()).toEqual([`overdue:${owner.id}`]);

    await db
      .update(schema.taskTable)
      .set({ dueDate: new Date(Date.now() + 7 * 1440 * MINUTE) })
      .where(eq(schema.taskTable.id, task.id));
    expect(await sentFor()).toEqual([]);
  });

  it("keeps the per-person key unique, so a second run inserts nothing", async () => {
    const { owner, fixture } = await setup();
    const task = await createTask(
      fixture.project.id,
      fixture.columns.todo.id,
      { dueDate: new Date(Date.now() - 3 * MINUTE) },
      [owner.id],
    );
    await checkDueDateReminders();
    await checkDueDateReminders();

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.taskReminderSentTable)
      .where(
        and(
          eq(schema.taskReminderSentTable.taskId, task.id),
          eq(schema.taskReminderSentTable.reminderType, `overdue:${owner.id}`),
        ),
      );
    expect(count).toBe(1);
  });
});
