import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import db, { schema } from "../../apps/api/src/database";
import { settleEvents } from "../../apps/api/src/events";
import { createApp } from "../../apps/api/src/index";
import { sendDueTaskReminders } from "../../apps/api/src/task-reminder/send-due";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import {
  addWorkspaceMember,
  createProjectFixture,
  createWorkspaceMember,
  taskTreeValues,
} from "./helpers/fixtures";

type User = typeof schema.userTable.$inferSelect;
type ReminderBody = {
  reminder: { remindAt: string; note: string | null } | null;
};

const HOUR = 60 * 60 * 1000;

let number = 0;

async function task(projectId: string, title = "Llamar a la distribuidora") {
  number += 1;
  const [row] = await db
    .insert(schema.taskTable)
    .values({
      ...taskTreeValues(),
      projectId,
      title,
      status: "to-do",
      priority: "medium",
      number,
    })
    .returning();
  if (!row) throw new Error("Failed to seed task");
  return row;
}

function as(user: User) {
  mockAuthenticatedSession(user);
  return createApp().app;
}

function put(body: unknown) {
  return {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}

async function reminderRows(taskId: string) {
  return db
    .select()
    .from(schema.taskReminderTable)
    .where(eq(schema.taskReminderTable.taskId, taskId));
}

async function notifications(taskId: string) {
  await settleEvents();
  return db
    .select({
      userId: schema.notificationTable.userId,
      eventData: schema.notificationTable.eventData,
    })
    .from(schema.notificationTable)
    .where(
      and(
        eq(schema.notificationTable.resourceId, taskId),
        eq(schema.notificationTable.type, "task_reminder"),
      ),
    );
}

async function setup() {
  const ana = await createWorkspaceMember({ userName: "Ana" });
  const ws = ana.workspace.id;
  const luis = await addWorkspaceMember(ws, "member");
  const vera = await addWorkspaceMember(ws, "viewer");
  const { project } = await createProjectFixture({ workspaceId: ws });
  return { ana: ana.user, luis, vera, ws, project };
}

describe("API integration: task reminders (ADR 077)", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  it("lets anyone who can read the task set, change and clear their own reminder", async () => {
    const { vera, project } = await setup();
    const row = await task(project.id);
    const app = as(vera);
    const at = new Date(Date.now() + 24 * HOUR).toISOString();

    const set = await app.request(
      `/api/task-reminder/${row.id}`,
      put({ remindAt: at, note: "  Por el cuadro  " }),
    );
    expect(set.status).toBe(200);
    expect(((await set.json()) as ReminderBody).reminder).toEqual({
      remindAt: at,
      note: "Por el cuadro",
    });

    // Sin `note`, la nota se conserva: el atajo del menu solo cambia la hora.
    const later = new Date(Date.now() + 48 * HOUR).toISOString();
    const moved = await app.request(
      `/api/task-reminder/${row.id}`,
      put({ remindAt: later }),
    );
    expect(((await moved.json()) as ReminderBody).reminder).toEqual({
      remindAt: later,
      note: "Por el cuadro",
    });
    expect(await reminderRows(row.id)).toHaveLength(1);

    const cleared = await app.request(
      `/api/task-reminder/${row.id}`,
      put({ remindAt: later, note: null }),
    );
    expect(((await cleared.json()) as ReminderBody).reminder?.note).toBeNull();

    const removed = await app.request(`/api/task-reminder/${row.id}`, {
      method: "DELETE",
    });
    expect(removed.status).toBe(200);
    expect(await reminderRows(row.id)).toEqual([]);
  });

  it("is private: someone else does not see it", async () => {
    const { ana, luis, project } = await setup();
    const row = await task(project.id);
    await as(ana).request(
      `/api/task-reminder/${row.id}`,
      put({ remindAt: new Date(Date.now() + HOUR).toISOString() }),
    );

    const response = await as(luis).request(`/api/task-reminder/${row.id}`);
    expect(((await response.json()) as ReminderBody).reminder).toBeNull();
  });

  it("rejects a past time, one more than a year away, and outsiders", async () => {
    const { ana, project } = await setup();
    const row = await task(project.id);
    const app = as(ana);

    const past = await app.request(
      `/api/task-reminder/${row.id}`,
      put({ remindAt: new Date(Date.now() - 2 * HOUR).toISOString() }),
    );
    expect(past.status).toBe(400);

    const far = await app.request(
      `/api/task-reminder/${row.id}`,
      put({
        remindAt: new Date(Date.now() + 400 * 24 * HOUR).toISOString(),
      }),
    );
    expect(far.status).toBe(400);

    const outsider = await createWorkspaceMember({ userName: "Fuera" });
    const denied = await as(outsider.user).request(
      `/api/task-reminder/${row.id}`,
      put({ remindAt: new Date(Date.now() + HOUR).toISOString() }),
    );
    expect(denied.status).toBe(403);
  });

  it("sends what is due once, with the note and where to open it, and leaves the rest", async () => {
    const { ana, luis, ws, project } = await setup();
    const due = await task(project.id, "Revisar acometida");
    const later = await task(project.id, "Pedir contenedor");
    await db.insert(schema.taskReminderTable).values([
      {
        taskId: due.id,
        userId: ana.id,
        remindAt: new Date(Date.now() - 60 * 1000),
        note: "Llamar a la distribuidora",
      },
      {
        taskId: later.id,
        userId: luis.id,
        remindAt: new Date(Date.now() + HOUR),
      },
    ]);

    const first = await sendDueTaskReminders();
    expect(first).toEqual({ degraded: false, sent: 1 });
    expect(await notifications(due.id)).toEqual([
      {
        userId: ana.id,
        eventData: expect.objectContaining({
          taskTitle: "Revisar acometida",
          note: "Llamar a la distribuidora",
          projectId: project.id,
          workspaceId: ws,
        }),
      },
    ]);
    expect(await reminderRows(due.id)).toEqual([]);
    expect(await reminderRows(later.id)).toHaveLength(1);

    // La segunda vuelta no repite nada.
    expect(await sendDueTaskReminders()).toEqual({ degraded: false, sent: 0 });
    expect(await notifications(due.id)).toHaveLength(1);
  });

  it("drops the reminder of someone who left the workspace", async () => {
    const { luis, ws, project } = await setup();
    const row = await task(project.id);
    await db.insert(schema.taskReminderTable).values({
      taskId: row.id,
      userId: luis.id,
      remindAt: new Date(Date.now() - 60 * 1000),
    });
    await db
      .delete(schema.workspaceUserTable)
      .where(
        and(
          eq(schema.workspaceUserTable.workspaceId, ws),
          eq(schema.workspaceUserTable.userId, luis.id),
        ),
      );

    expect(await sendDueTaskReminders()).toEqual({ degraded: false, sent: 0 });
    expect(await notifications(row.id)).toEqual([]);
    expect(await reminderRows(row.id)).toEqual([]);
  });
});
