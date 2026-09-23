import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { serverDayKey } from "../../apps/api/src/utils/day-boundaries";
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
      title: "Tender el tablero",
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

async function assign(taskId: string, userId: string) {
  await db.insert(schema.taskAssigneeTable).values({ taskId, userId });
}

async function planTask(
  taskId: string,
  workspaceId: string,
  userId: string,
  plannedDate: Date,
  overrides: Partial<typeof schema.personalPlanEntryTable.$inferInsert> = {},
) {
  await db
    .insert(schema.personalPlanEntryTable)
    .values({ workspaceId, userId, taskId, plannedDate, ...overrides });
}

// Manana, no hoy: el reparto de "hoy" arranca en `max(inicio de jornada,
// ahora)` (ADR 041), y forzar assertions de colocacion contra la hora real a
// la que corre la suite las haria fallar fuera de 08:00-18:00 UTC. Manana
// siempre arranca a las 08:00, sea cual sea la hora a la que corre esto.
function tomorrow(): Date {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(0, 0, 0, 0);
  return date;
}

// `serverDayKey` y no `toISOString().slice(0, 10)`: la API ya usa el dia del
// servidor (hallazgo 3 de la revision), y comparar contra una clave UTC
// divergiria en cuanto la suite corriera con otra zona horaria.
const dateKey = serverDayKey;

function getSchedule(app: App, workspaceId: string, days?: number) {
  const query = days ? `&days=${days}` : "";
  return app.request(`/api/schedule?workspaceId=${workspaceId}${query}`);
}

function putEntryTime(
  app: App,
  workspaceId: string,
  taskId: string,
  startMinute: number | null,
) {
  return app.request(
    `/api/schedule/entries/${taskId}?workspaceId=${workspaceId}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ startMinute }),
    },
  );
}

function postBlock(
  app: App,
  workspaceId: string,
  body: Record<string, unknown>,
) {
  return app.request(`/api/schedule/blocks?workspaceId=${workspaceId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function deleteBlock(app: App, workspaceId: string, id: string) {
  return app.request(`/api/schedule/blocks/${id}?workspaceId=${workspaceId}`, {
    method: "DELETE",
  });
}

function patchBlock(
  app: App,
  workspaceId: string,
  id: string,
  body: Record<string, unknown>,
) {
  return app.request(`/api/schedule/blocks/${id}?workspaceId=${workspaceId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Anade a quien ya es miembro de un espacio a un segundo, distinto. */
async function addToAnotherWorkspace(userId: string) {
  const other = await createWorkspaceMember({ role: "member" });
  await db.insert(schema.workspaceUserTable).values({
    workspaceId: other.workspace.id,
    userId,
    role: "member",
    joinedAt: new Date(),
  });
  return other.workspace;
}

async function setup(role = "member") {
  const member = await createWorkspaceMember({ role });
  const fixture = await createProjectFixture({
    workspaceId: member.workspace.id,
  });

  return {
    app: asUser(member.user),
    workspaceId: member.workspace.id,
    projectId: fixture.project.id,
    columnId: fixture.columns.todo.id,
    userId: member.user.id,
  };
}

describe("cronograma", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  it("places a planned task inside the work day, starting at 08:00", async () => {
    const { app, workspaceId, projectId, columnId, userId } = await setup();
    const day = tomorrow();
    const task = await createTask(projectId, columnId, { estimate: 1800 });
    await assign(task.id, userId);
    await planTask(task.id, workspaceId, userId, day, { position: 0 });

    const response = await getSchedule(app, workspaceId);
    expect(response.status).toBe(200);
    const body = await response.json();

    const dayLayout = body.days.find(
      (d: { dayDate: string }) => d.dayDate === dateKey(day),
    );
    expect(dayLayout).toBeDefined();
    const flow = dayLayout.segments.find(
      (s: { type: string }) => s.type === "flow",
    );
    expect(flow).toMatchObject({
      taskId: task.id,
      startSecond: 8 * 3600,
      endSecond: 8 * 3600 + 1800,
    });
    expect(flow.task.id).toBe(task.id);
  });

  it("splits a flowing entry around a fixed block that falls inside it", async () => {
    const { app, workspaceId, projectId, columnId, userId } = await setup();
    const day = tomorrow();
    const task = await createTask(projectId, columnId, { estimate: 7200 });
    await assign(task.id, userId);
    await planTask(task.id, workspaceId, userId, day, { position: 0 });

    await postBlock(app, workspaceId, {
      title: "Visita de obra",
      kind: "fixed",
      startMinute: 8 * 60 + 15,
      endMinute: 8 * 60 + 45,
      plannedDate: day.toISOString(),
    });

    const body = await (await getSchedule(app, workspaceId)).json();
    const dayLayout = body.days.find(
      (d: { dayDate: string }) => d.dayDate === dateKey(day),
    );
    const flowParts = dayLayout.segments.filter(
      (s: { type: string }) => s.type === "flow",
    );

    expect(flowParts).toHaveLength(2);
    expect(flowParts[0]).toMatchObject({ startSecond: 8 * 3600, part: 0 });
    expect(flowParts[1]).toMatchObject({ part: 1 });
    expect(
      dayLayout.segments.some((s: { type: string }) => s.type === "block"),
    ).toBe(true);
  });

  it("anchors an entry to a clock time and can free it back to flowing", async () => {
    const { app, workspaceId, projectId, columnId, userId } = await setup();
    const day = tomorrow();
    const task = await createTask(projectId, columnId);
    await assign(task.id, userId);
    await planTask(task.id, workspaceId, userId, day, { position: 0 });

    const pinned = await putEntryTime(app, workspaceId, task.id, 9 * 60);
    expect(pinned.status).toBe(200);

    let body = await (await getSchedule(app, workspaceId)).json();
    let dayLayout = body.days.find(
      (d: { dayDate: string }) => d.dayDate === dateKey(day),
    );
    expect(
      dayLayout.segments.find((s: { type: string }) => s.type === "pinned"),
    ).toMatchObject({ taskId: task.id, startSecond: 9 * 3600 });

    const freed = await putEntryTime(app, workspaceId, task.id, null);
    expect(freed.status).toBe(200);

    body = await (await getSchedule(app, workspaceId)).json();
    dayLayout = body.days.find(
      (d: { dayDate: string }) => d.dayDate === dateKey(day),
    );
    expect(
      dayLayout.segments.some((s: { type: string }) => s.type === "pinned"),
    ).toBe(false);
    expect(
      dayLayout.segments.find((s: { type: string }) => s.type === "flow"),
    ).toMatchObject({ taskId: task.id });
  });

  it("refuses to anchor a task that has no plan entry yet", async () => {
    const { app, workspaceId, projectId, columnId, userId } = await setup();
    const task = await createTask(projectId, columnId);
    await assign(task.id, userId);

    const response = await putEntryTime(app, workspaceId, task.id, 9 * 60);
    expect(response.status).toBe(404);
  });

  it("projects a repeating block across the window without storing a row per day", async () => {
    const { app, workspaceId } = await setup();

    const created = await postBlock(app, workspaceId, {
      title: "Comida",
      kind: "break",
      startMinute: 13 * 60,
      endMinute: 14 * 60,
      cadence: { frequency: "daily", interval: 1 },
    });
    expect(created.status).toBe(200);

    const rows = await db.select().from(schema.scheduleBlockTable);
    expect(rows).toHaveLength(1);

    const body = await (await getSchedule(app, workspaceId, 5)).json();
    const daysWithLunch = body.days.filter((d: { segments: unknown[] }) =>
      d.segments.some(
        (s: { type: string; entries?: { title: string }[] }) =>
          s.type === "block" &&
          s.entries?.some((entry) => entry.title === "Comida"),
      ),
    );
    expect(daysWithLunch).toHaveLength(5);
  });

  it("rejects a block that gives neither plannedDate nor cadence, or both", async () => {
    const { app, workspaceId } = await setup();

    const missing = await postBlock(app, workspaceId, {
      title: "Roto",
      kind: "fixed",
      startMinute: 60,
      endMinute: 120,
    });
    expect(missing.status).toBe(400);

    const both = await postBlock(app, workspaceId, {
      title: "Roto",
      kind: "fixed",
      startMinute: 60,
      endMinute: 120,
      plannedDate: tomorrow().toISOString(),
      cadence: { frequency: "daily", interval: 1 },
    });
    expect(both.status).toBe(400);
  });

  it("deletes a block", async () => {
    const { app, workspaceId } = await setup();
    const day = tomorrow();

    const created = await (
      await postBlock(app, workspaceId, {
        title: "Cita",
        kind: "fixed",
        startMinute: 60,
        endMinute: 120,
        plannedDate: day.toISOString(),
      })
    ).json();

    const response = await deleteBlock(app, workspaceId, created.id);
    expect(response.status).toBe(200);

    const rows = await db.select().from(schema.scheduleBlockTable);
    expect(rows).toHaveLength(0);
  });

  it("shows the running timer as a block on today", async () => {
    const { app, workspaceId, projectId, columnId, userId } = await setup();
    const task = await createTask(projectId, columnId);
    await db.insert(schema.timeEntryTable).values({
      taskId: task.id,
      userId,
      startTime: new Date(Date.now() - 5 * 60 * 1000),
      endTime: null,
    });

    const body = await (await getSchedule(app, workspaceId)).json();
    const today = body.days.find((d: { isToday: boolean }) => d.isToday);
    expect(
      today.segments.some(
        (s: { type: string; entries?: { kind: string }[] }) =>
          s.type === "block" &&
          s.entries?.some((entry) => entry.kind === "running"),
      ),
    ).toBe(true);
  });

  it("someone outside the workspace cannot read its schedule", async () => {
    const { workspaceId } = await setup();
    const outsider = await createWorkspaceMember({ role: "member" });
    const outsiderApp = asUser(outsider.user);

    const response = await getSchedule(outsiderApp, workspaceId);
    expect(response.status).toBe(403);
  });

  it("cannot update a block through another workspace of the same person", async () => {
    const { app, workspaceId, userId } = await setup();
    const created = await (
      await postBlock(app, workspaceId, {
        title: "Cita",
        kind: "fixed",
        startMinute: 60,
        endMinute: 120,
        plannedDate: tomorrow().toISOString(),
      })
    ).json();

    const otherWorkspace = await addToAnotherWorkspace(userId);
    const response = await patchBlock(app, otherWorkspace.id, created.id, {
      title: "Cita movida",
      kind: "fixed",
      startMinute: 60,
      endMinute: 150,
    });
    expect(response.status).toBe(404);

    const [unchanged] = await db
      .select()
      .from(schema.scheduleBlockTable)
      .where(eq(schema.scheduleBlockTable.id, created.id));
    expect(unchanged?.title).toBe("Cita");
  });

  it("cannot delete a block through another workspace of the same person", async () => {
    const { app, workspaceId, userId } = await setup();
    const created = await (
      await postBlock(app, workspaceId, {
        title: "Cita",
        kind: "fixed",
        startMinute: 60,
        endMinute: 120,
        plannedDate: tomorrow().toISOString(),
      })
    ).json();

    const otherWorkspace = await addToAnotherWorkspace(userId);
    const response = await deleteBlock(app, otherWorkspace.id, created.id);
    expect(response.status).toBe(404);

    const rows = await db.select().from(schema.scheduleBlockTable);
    expect(rows).toHaveLength(1);
  });

  it("cannot anchor a plan entry through another workspace of the same person", async () => {
    const { app, workspaceId, projectId, columnId, userId } = await setup();
    const task = await createTask(projectId, columnId);
    await assign(task.id, userId);
    await planTask(task.id, workspaceId, userId, tomorrow(), { position: 0 });

    const otherWorkspace = await addToAnotherWorkspace(userId);
    const response = await putEntryTime(
      app,
      otherWorkspace.id,
      task.id,
      9 * 60,
    );
    expect(response.status).toBe(404);
  });

  it("rejects a block startMinute of 1440 with 400, not 500", async () => {
    const { app, workspaceId } = await setup();

    const response = await postBlock(app, workspaceId, {
      title: "Roto",
      kind: "fixed",
      startMinute: 1440,
      endMinute: 1440,
      plannedDate: tomorrow().toISOString(),
    });
    expect(response.status).toBe(400);
  });

  it("rejects a plan entry startMinute of 1440 with 400, not 500", async () => {
    const { app, workspaceId, projectId, columnId, userId } = await setup();
    const task = await createTask(projectId, columnId);
    await assign(task.id, userId);
    await planTask(task.id, workspaceId, userId, tomorrow(), { position: 0 });

    const response = await putEntryTime(app, workspaceId, task.id, 1440);
    expect(response.status).toBe(400);
  });
});
