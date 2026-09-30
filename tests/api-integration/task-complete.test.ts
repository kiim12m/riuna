import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
  taskTreeValues,
} from "./helpers/fixtures";

type App = ReturnType<typeof createApp>["app"];

function asUser(user: typeof schema.userTable.$inferSelect): App {
  mockAuthenticatedSession(user);
  return createApp().app;
}

async function createTask(
  projectId: string,
  columnId: string,
  overrides: Partial<typeof schema.taskTable.$inferInsert> = {},
) {
  const [task] = await db
    .insert(schema.taskTable)
    .values({
      ...taskTreeValues(),
      projectId,
      title: "Revisar cuadro electrico",
      status: "to-do",
      columnId,
      priority: "medium",
      number: 1,
      position: 0,
      ...overrides,
    })
    .returning();
  if (!task) throw new Error("Failed to seed task");
  return task;
}

function complete(app: App, taskId: string, done: boolean) {
  return app.request(`/api/task/complete/${taskId}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ done }),
  });
}

beforeEach(async () => {
  await resetTestDatabase();
});

describe("POST /task/complete/:id (ADR 046)", () => {
  it("moves the task to the project's final column when marked done", async () => {
    const { user, workspace } = await createWorkspaceMember({ role: "owner" });
    const { project, columns } = await createProjectFixture({
      workspaceId: workspace.id,
    });
    const task = await createTask(project.id, columns.todo.id);

    const response = await complete(asUser(user), task.id, true);
    expect(response.status).toBe(200);

    const [updated] = await db
      .select()
      .from(schema.taskTable)
      .where(eq(schema.taskTable.id, task.id));
    expect(updated?.status).toBe(columns.done.slug);
    expect(updated?.columnId).toBe(columns.done.id);
  });

  it("moves the task back to the first non-final column when unmarked", async () => {
    const { user, workspace } = await createWorkspaceMember({ role: "owner" });
    const { project, columns } = await createProjectFixture({
      workspaceId: workspace.id,
    });
    const task = await createTask(project.id, columns.done.id, {
      status: columns.done.slug,
    });

    const response = await complete(asUser(user), task.id, false);
    expect(response.status).toBe(200);

    const [updated] = await db
      .select()
      .from(schema.taskTable)
      .where(eq(schema.taskTable.id, task.id));
    expect(updated?.status).toBe(columns.todo.slug);
  });

  it("stops the running timer when the task is marked done (ADR 044)", async () => {
    const { user, workspace } = await createWorkspaceMember({ role: "owner" });
    const { project, columns } = await createProjectFixture({
      workspaceId: workspace.id,
    });
    const task = await createTask(project.id, columns.todo.id);
    const app = asUser(user);

    const started = await app.request("/api/time-entry/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ taskId: task.id }),
    });
    const entry = await started.json();

    await complete(app, task.id, true);
    await new Promise((resolve) => setTimeout(resolve, 200));

    const [closed] = await db
      .select()
      .from(schema.timeEntryTable)
      .where(eq(schema.timeEntryTable.id, entry.id));
    expect(closed?.endTime).not.toBeNull();
  });

  it("falls back to the legacy 'done' slug when no column is marked final", async () => {
    const { user, workspace } = await createWorkspaceMember({ role: "owner" });
    const { project } = await createProjectFixture({
      workspaceId: workspace.id,
    });
    // Instalacion heredada: ninguna columna del proyecto lleva `isFinal`.
    await db
      .update(schema.columnTable)
      .set({ isFinal: false })
      .where(eq(schema.columnTable.projectId, project.id));
    const doneColumn = await db.query.columnTable.findFirst({
      where: eq(schema.columnTable.slug, "done"),
    });
    if (!doneColumn) throw new Error("Missing seeded 'done' column");
    const task = await createTask(project.id, doneColumn.id, {
      status: "to-do",
      columnId: null,
    });

    const response = await complete(asUser(user), task.id, true);
    expect(response.status).toBe(200);

    const [updated] = await db
      .select()
      .from(schema.taskTable)
      .where(eq(schema.taskTable.id, task.id));
    expect(updated?.status).toBe("done");
  });

  it("rejects a task that does not exist before reaching the controller", async () => {
    const { user } = await createWorkspaceMember({ role: "owner" });
    const response = await complete(asUser(user), "task-does-not-exist", true);
    // `workspaceAccess.fromTask()` no puede resolver el espacio de una tarea
    // que no existe y corta ahi, antes de que `completeTask` llegue a
    // comprobarlo el mismo (mismo comportamiento que el resto de rutas por
    // tarea, ver `workspace-access-middleware.ts`).
    expect(response.status).toBe(400);
  });

  it("rejects a member of another workspace", async () => {
    const { workspace } = await createWorkspaceMember({ role: "owner" });
    const { project, columns } = await createProjectFixture({
      workspaceId: workspace.id,
    });
    const task = await createTask(project.id, columns.todo.id);

    const stranger = await createWorkspaceMember({ role: "owner" });

    const response = await complete(asUser(stranger.user), task.id, true);
    expect(response.status).toBe(403);
  });
});
