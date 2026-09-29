import { randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
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

/** Un segundo miembro del mismo espacio, para las pruebas de propiedad. */
async function addMember(workspaceId: string, role: string) {
  const userId = `user-${randomUUID()}`;

  const [user] = await db
    .insert(schema.userTable)
    .values({
      id: userId,
      email: `${userId}@example.com`,
      emailVerified: true,
      name: "Other Member",
    })
    .returning();
  if (!user) throw new Error("Failed to seed member");

  await db.insert(schema.workspaceUserTable).values({
    workspaceId,
    userId: user.id,
    role,
    joinedAt: new Date(),
  });

  return user;
}

async function createTask(
  projectId: string,
  columnId: string | null,
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
      estimate: 3600,
      ...overrides,
    })
    .returning();
  if (!task) throw new Error("Failed to seed task");
  return task;
}

async function runningEntriesFor(userId: string) {
  return db
    .select()
    .from(schema.timeEntryTable)
    .where(
      and(
        eq(schema.timeEntryTable.userId, userId),
        isNull(schema.timeEntryTable.endTime),
      ),
    );
}

beforeEach(async () => {
  await resetTestDatabase();
});

describe("timer: one entry running per person (ADR 044)", () => {
  it("closes the previous running entry when starting a different task", async () => {
    const { user, workspace } = await createWorkspaceMember({ role: "owner" });
    const { project, columns } = await createProjectFixture({
      workspaceId: workspace.id,
    });
    const taskA = await createTask(project.id, columns.todo.id, {
      title: "Tarea A",
      number: 1,
    });
    const taskB = await createTask(project.id, columns.todo.id, {
      title: "Tarea B",
      number: 2,
    });

    const app = asUser(user);

    const startA = await app.request("/api/time-entry/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ taskId: taskA.id }),
    });
    expect(startA.status).toBe(200);
    const entryA = await startA.json();
    expect(entryA.endTime).toBeNull();

    const startB = await app.request("/api/time-entry/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ taskId: taskB.id }),
    });
    expect(startB.status).toBe(200);
    const entryB = await startB.json();
    expect(entryB.taskId).toBe(taskB.id);
    expect(entryB.endTime).toBeNull();

    // Solo una entrada abierta a la vez: la de A se cerro sola.
    const running = await runningEntriesFor(user.id);
    expect(running).toHaveLength(1);
    expect(running[0]?.id).toBe(entryB.id);

    const [closedA] = await db
      .select()
      .from(schema.timeEntryTable)
      .where(eq(schema.timeEntryTable.id, entryA.id));
    expect(closedA?.endTime).not.toBeNull();
    expect(closedA?.duration).toBeGreaterThanOrEqual(0);
  });

  it("is idempotent when starting the task that is already running", async () => {
    const { user, workspace } = await createWorkspaceMember({ role: "owner" });
    const { project, columns } = await createProjectFixture({
      workspaceId: workspace.id,
    });
    const task = await createTask(project.id, columns.todo.id);

    const app = asUser(user);

    const first = await app.request("/api/time-entry/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ taskId: task.id }),
    });
    const firstEntry = await first.json();

    const second = await app.request("/api/time-entry/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ taskId: task.id }),
    });
    expect(second.status).toBe(200);
    const secondEntry = await second.json();

    expect(secondEntry.id).toBe(firstEntry.id);

    const running = await runningEntriesFor(user.id);
    expect(running).toHaveLength(1);
  });

  it("rejects starting a timer on a task that is already done", async () => {
    const { user, workspace } = await createWorkspaceMember({ role: "owner" });
    const { project, columns } = await createProjectFixture({
      workspaceId: workspace.id,
    });
    const task = await createTask(project.id, columns.done.id, {
      status: "done",
    });

    const app = asUser(user);

    const response = await app.request("/api/time-entry/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ taskId: task.id }),
    });

    expect(response.status).toBe(409);
    expect(await runningEntriesFor(user.id)).toHaveLength(0);
  });

  it("a manual create without endTime also closes what was running", async () => {
    const { user, workspace } = await createWorkspaceMember({ role: "owner" });
    const { project, columns } = await createProjectFixture({
      workspaceId: workspace.id,
    });
    const taskA = await createTask(project.id, columns.todo.id, {
      title: "Tarea A",
      number: 1,
    });
    const taskB = await createTask(project.id, columns.todo.id, {
      title: "Tarea B",
      number: 2,
    });

    const app = asUser(user);

    await app.request("/api/time-entry/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ taskId: taskA.id }),
    });

    // El POST viejo, sin endTime: tambien nace en marcha y cierra lo que
    // hubiera antes.
    const response = await app.request("/api/time-entry", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        taskId: taskB.id,
        startTime: new Date().toISOString(),
      }),
    });
    expect(response.status).toBe(200);

    const running = await runningEntriesFor(user.id);
    expect(running).toHaveLength(1);
    expect(running[0]?.taskId).toBe(taskB.id);
  });

  it("the partial unique index rejects two open entries inserted directly", async () => {
    const { user, workspace } = await createWorkspaceMember({ role: "owner" });
    const { project, columns } = await createProjectFixture({
      workspaceId: workspace.id,
    });
    const taskA = await createTask(project.id, columns.todo.id, {
      title: "Tarea A",
      number: 1,
    });
    const taskB = await createTask(project.id, columns.todo.id, {
      title: "Tarea B",
      number: 2,
    });

    await db.insert(schema.timeEntryTable).values({
      taskId: taskA.id,
      userId: user.id,
      description: "",
      startTime: new Date(),
      endTime: null,
      duration: null,
    });

    await expect(
      db.insert(schema.timeEntryTable).values({
        taskId: taskB.id,
        userId: user.id,
        description: "",
        startTime: new Date(),
        endTime: null,
        duration: null,
      }),
    ).rejects.toThrow();
  });
});

describe("timer: stop", () => {
  it("stops the running entry and returns the closed row", async () => {
    const { user, workspace } = await createWorkspaceMember({ role: "owner" });
    const { project, columns } = await createProjectFixture({
      workspaceId: workspace.id,
    });
    const task = await createTask(project.id, columns.todo.id);

    const app = asUser(user);

    await app.request("/api/time-entry/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ taskId: task.id }),
    });

    const response = await app.request("/api/time-entry/stop", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(response.status).toBe(200);
    const stopped = await response.json();
    expect(stopped.endTime).not.toBeNull();
    expect(stopped.duration).toBeGreaterThanOrEqual(0);

    expect(await runningEntriesFor(user.id)).toHaveLength(0);
  });

  it("404s when nothing is running", async () => {
    const { user } = await createWorkspaceMember({ role: "owner" });
    const app = asUser(user);

    const response = await app.request("/api/time-entry/stop", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(404);
  });

  it("accepts an explicit endTime for a timer left running overnight", async () => {
    const { user, workspace } = await createWorkspaceMember({ role: "owner" });
    const { project, columns } = await createProjectFixture({
      workspaceId: workspace.id,
    });
    const task = await createTask(project.id, columns.todo.id);

    const [entry] = await db
      .insert(schema.timeEntryTable)
      .values({
        taskId: task.id,
        userId: user.id,
        description: "",
        startTime: new Date("2026-01-01T09:00:00.000Z"),
        endTime: null,
        duration: null,
      })
      .returning();

    const app = asUser(user);
    const endTime = "2026-01-01T09:45:00.000Z";

    const response = await app.request("/api/time-entry/stop", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ endTime }),
    });
    expect(response.status).toBe(200);
    const stopped = await response.json();
    expect(stopped.id).toBe(entry?.id);
    expect(stopped.duration).toBe(45 * 60);
  });
});

describe("timer: stops automatically when the task is marked done (ADR 044)", () => {
  it("closes the tracker's running entry when the task enters a final column", async () => {
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

    const statusResponse = await app.request(`/api/task/status/${task.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: columns.done.slug }),
    });
    expect(statusResponse.status).toBe(200);

    // El evento se procesa async: sondear en vez de asumir el orden.
    await new Promise((resolve) => setTimeout(resolve, 200));

    const [closed] = await db
      .select()
      .from(schema.timeEntryTable)
      .where(eq(schema.timeEntryTable.id, entry.id));
    expect(closed?.endTime).not.toBeNull();
  });

  it("does not touch the running entry when the status change is not final", async () => {
    const { user, workspace } = await createWorkspaceMember({ role: "owner" });
    const { project, columns } = await createProjectFixture({
      workspaceId: workspace.id,
    });
    const task = await createTask(project.id, columns.todo.id);

    const app = asUser(user);
    await app.request("/api/time-entry/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ taskId: task.id }),
    });

    await app.request(`/api/task/status/${task.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: columns.inProgress.slug }),
    });

    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(await runningEntriesFor(user.id)).toHaveLength(1);
  });
});

describe("timer: GET /time-entry/running", () => {
  it("reports null when nothing is running and no closed entry exists", async () => {
    const { user, workspace } = await createWorkspaceMember({ role: "owner" });
    const app = asUser(user);

    const response = await app.request(
      `/api/time-entry/running?workspaceId=${workspace.id}`,
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.running).toBeNull();
    expect(body.last).toBeNull();
  });

  it("returns the running entry with its task and prior logged seconds", async () => {
    const { user, workspace } = await createWorkspaceMember({ role: "owner" });
    const { project, columns } = await createProjectFixture({
      workspaceId: workspace.id,
    });
    const task = await createTask(project.id, columns.todo.id, {
      estimate: 7200,
    });

    // Una entrada ya cerrada de la misma tarea, para comprobar
    // `loggedBeforeSeconds`.
    await db.insert(schema.timeEntryTable).values({
      taskId: task.id,
      userId: user.id,
      description: "",
      startTime: new Date("2026-01-01T08:00:00.000Z"),
      endTime: new Date("2026-01-01T08:30:00.000Z"),
      duration: 1800,
    });

    const app = asUser(user);
    await app.request("/api/time-entry/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ taskId: task.id }),
    });

    const response = await app.request(
      `/api/time-entry/running?workspaceId=${workspace.id}`,
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.running.task.id).toBe(task.id);
    expect(body.running.task.estimate).toBe(7200);
    expect(body.running.loggedBeforeSeconds).toBe(1800);
    expect(body.last).toBeNull();
  });

  it("offers the last undone task to resume when nothing is running", async () => {
    const { user, workspace } = await createWorkspaceMember({ role: "owner" });
    const { project, columns } = await createProjectFixture({
      workspaceId: workspace.id,
    });
    const task = await createTask(project.id, columns.todo.id);

    await db.insert(schema.timeEntryTable).values({
      taskId: task.id,
      userId: user.id,
      description: "",
      startTime: new Date("2026-01-01T08:00:00.000Z"),
      endTime: new Date("2026-01-01T08:30:00.000Z"),
      duration: 1800,
    });

    const app = asUser(user);
    const response = await app.request(
      `/api/time-entry/running?workspaceId=${workspace.id}`,
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.running).toBeNull();
    expect(body.last.taskId).toBe(task.id);
  });

  it("does not offer a done task to resume", async () => {
    const { user, workspace } = await createWorkspaceMember({ role: "owner" });
    const { project, columns } = await createProjectFixture({
      workspaceId: workspace.id,
    });
    const task = await createTask(project.id, columns.todo.id);

    await db.insert(schema.timeEntryTable).values({
      taskId: task.id,
      userId: user.id,
      description: "",
      startTime: new Date("2026-01-01T08:00:00.000Z"),
      endTime: new Date("2026-01-01T08:30:00.000Z"),
      duration: 1800,
    });

    await db
      .update(schema.taskTable)
      .set({ status: columns.done.slug, columnId: columns.done.id })
      .where(eq(schema.taskTable.id, task.id));

    const app = asUser(user);
    const response = await app.request(
      `/api/time-entry/running?workspaceId=${workspace.id}`,
    );
    const body = await response.json();
    expect(body.last).toBeNull();
  });
});

describe("timer: ownership (ADR 044)", () => {
  it("refuses to edit a time entry that belongs to someone else", async () => {
    const { user: owner, workspace } = await createWorkspaceMember({
      role: "owner",
    });
    const other = await addMember(workspace.id, "member");
    const { project, columns } = await createProjectFixture({
      workspaceId: workspace.id,
    });
    const task = await createTask(project.id, columns.todo.id);

    const [entry] = await db
      .insert(schema.timeEntryTable)
      .values({
        taskId: task.id,
        userId: owner.id,
        description: "",
        startTime: new Date("2026-01-01T08:00:00.000Z"),
        endTime: new Date("2026-01-01T08:30:00.000Z"),
        duration: 1800,
      })
      .returning();

    const app = asUser(other);

    const putResponse = await app.request(`/api/time-entry/${entry?.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        startTime: "2026-01-01T09:00:00.000Z",
      }),
    });
    expect(putResponse.status).toBe(404);

    const deleteResponse = await app.request(`/api/time-entry/${entry?.id}`, {
      method: "DELETE",
    });
    expect(deleteResponse.status).toBe(404);

    const [untouched] = await db
      .select()
      .from(schema.timeEntryTable)
      .where(eq(schema.timeEntryTable.id, entry?.id ?? ""));
    expect(untouched?.startTime.toISOString()).toBe("2026-01-01T08:00:00.000Z");
  });

  it("lets the owner delete their own entry", async () => {
    const { user, workspace } = await createWorkspaceMember({ role: "owner" });
    const { project, columns } = await createProjectFixture({
      workspaceId: workspace.id,
    });
    const task = await createTask(project.id, columns.todo.id);

    const [entry] = await db
      .insert(schema.timeEntryTable)
      .values({
        taskId: task.id,
        userId: user.id,
        description: "",
        startTime: new Date("2026-01-01T08:00:00.000Z"),
        endTime: new Date("2026-01-01T08:30:00.000Z"),
        duration: 1800,
      })
      .returning();

    const app = asUser(user);
    const response = await app.request(`/api/time-entry/${entry?.id}`, {
      method: "DELETE",
    });
    expect(response.status).toBe(200);

    const [gone] = await db
      .select()
      .from(schema.timeEntryTable)
      .where(eq(schema.timeEntryTable.id, entry?.id ?? ""));
    expect(gone).toBeUndefined();
  });
});
