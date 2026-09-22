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
      title: "Revisar cuadro",
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

async function logTime(
  taskId: string,
  userId: string,
  startTime: Date,
  durationSeconds: number | null,
) {
  const endTime =
    durationSeconds === null
      ? null
      : new Date(startTime.getTime() + durationSeconds * 1000);
  await db.insert(schema.timeEntryTable).values({
    taskId,
    userId,
    startTime,
    endTime,
    duration: durationSeconds,
  });
}

function getTimeSheet(
  app: App,
  workspaceId: string,
  query: Record<string, string> = {},
) {
  const params = new URLSearchParams({ workspaceId, ...query });
  return app.request(`/api/time-sheet?${params}`);
}

function exportTimeSheet(
  app: App,
  workspaceId: string,
  query: Record<string, string> = {},
) {
  const params = new URLSearchParams({ workspaceId, ...query });
  return app.request(`/api/time-sheet/export?${params}`);
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

const day = (offset: number) => {
  const date = new Date();
  date.setHours(10, 0, 0, 0);
  date.setDate(date.getDate() + offset);
  return date;
};

describe("parte de horas", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  it("groups by day and sums seconds", async () => {
    const { app, workspaceId, projectId, columnId, userId } = await setup();
    const task = await createTask(projectId, columnId);
    await logTime(task.id, userId, day(0), 3600);
    await logTime(task.id, userId, day(0), 1800);
    await logTime(task.id, userId, day(-1), 900);

    const body = await (await getTimeSheet(app, workspaceId)).json();

    expect(body.groupBy).toBe("day");
    expect(body.totalSeconds).toBe(3600 + 1800 + 900);
    const today = body.groups.find(
      (g: { key: string }) => g.key === day(0).toISOString().slice(0, 10),
    );
    expect(today).toMatchObject({ seconds: 5400, entryCount: 2 });
  });

  it("groups by task with the task title as label", async () => {
    const { app, workspaceId, projectId, columnId, userId } = await setup();
    const task = await createTask(projectId, columnId, {
      title: "Sustituir bomba",
    });
    await logTime(task.id, userId, day(0), 1200);

    const body = await (
      await getTimeSheet(app, workspaceId, { groupBy: "task" })
    ).json();

    expect(body.groups).toEqual([
      { key: task.id, label: "Sustituir bomba", seconds: 1200, entryCount: 1 },
    ]);
  });

  it("groups by project with the project name as label", async () => {
    const { app, workspaceId, projectId, columnId, userId } = await setup();
    const task = await createTask(projectId, columnId);
    await logTime(task.id, userId, day(0), 600);

    const [project] = await db
      .select({ name: schema.projectTable.name })
      .from(schema.projectTable)
      .where(eq(schema.projectTable.id, projectId));

    const body = await (
      await getTimeSheet(app, workspaceId, { groupBy: "project" })
    ).json();

    expect(body.groups).toEqual([
      { key: projectId, label: project?.name, seconds: 600, entryCount: 1 },
    ]);
  });

  it("counts a running entry's elapsed time instead of dropping it", async () => {
    const { app, workspaceId, projectId, columnId, userId } = await setup();
    const task = await createTask(projectId, columnId);
    const startedFiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    await logTime(task.id, userId, startedFiveMinutesAgo, null);

    const body = await (await getTimeSheet(app, workspaceId)).json();

    expect(body.totalSeconds).toBeGreaterThanOrEqual(290);
    expect(body.totalSeconds).toBeLessThan(600);
  });

  it("excludes entries outside the requested range", async () => {
    const { app, workspaceId, projectId, columnId, userId } = await setup();
    const task = await createTask(projectId, columnId);
    await logTime(task.id, userId, day(-40), 3600);

    const body = await (await getTimeSheet(app, workspaceId)).json();
    expect(body.totalSeconds).toBe(0);
  });

  it("still counts time logged against an archived project", async () => {
    const { app, workspaceId, projectId, columnId, userId } = await setup();
    const task = await createTask(projectId, columnId);
    await logTime(task.id, userId, day(0), 1800);
    await db
      .update(schema.projectTable)
      .set({ archivedAt: new Date() })
      .where(eq(schema.projectTable.id, projectId));

    const body = await (await getTimeSheet(app, workspaceId)).json();
    expect(body.totalSeconds).toBe(1800);
  });

  it("rejects a range with only start or only end", async () => {
    const { app, workspaceId } = await setup();
    const response = await getTimeSheet(app, workspaceId, {
      start: "2026-01-01",
    });
    expect(response.status).toBe(400);
  });

  it("rejects an end before start", async () => {
    const { app, workspaceId } = await setup();
    const response = await getTimeSheet(app, workspaceId, {
      start: "2026-01-10",
      end: "2026-01-01",
    });
    expect(response.status).toBe(400);
  });

  it("exports a spreadsheet", async () => {
    const { app, workspaceId, projectId, columnId, userId } = await setup();
    const task = await createTask(projectId, columnId);
    await logTime(task.id, userId, day(0), 3600);

    const response = await exportTimeSheet(app, workspaceId);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("spreadsheetml");
    expect(response.headers.get("content-disposition")).toContain(
      "parte-de-horas",
    );
  });

  it("someone outside the workspace cannot read its time sheet", async () => {
    const { workspaceId } = await setup();
    const outsider = await createWorkspaceMember({ role: "member" });
    const outsiderApp = asUser(outsider.user);

    const response = await getTimeSheet(outsiderApp, workspaceId);
    expect(response.status).toBe(403);
  });
});
