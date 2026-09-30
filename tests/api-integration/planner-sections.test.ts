import { randomUUID } from "node:crypto";
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
      title: "Sustituir bomba",
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

async function assign(taskId: string, userId: string) {
  await db.insert(schema.taskAssigneeTable).values({ taskId, userId });
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

function today() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function daysFrom(base: Date, offset: number) {
  const date = new Date(base);
  date.setDate(date.getDate() + offset);
  return date;
}

async function planTask(
  taskId: string,
  workspaceId: string,
  userId: string,
  plannedDate: Date,
  overrides: Partial<typeof schema.personalPlanEntryTable.$inferInsert> = {},
) {
  await db.insert(schema.personalPlanEntryTable).values({
    workspaceId,
    userId,
    taskId,
    plannedDate,
    position: 0,
    ...overrides,
  });
}

async function createFixedBlock(
  workspaceId: string,
  userId: string,
  plannedDate: Date,
  overrides: Partial<typeof schema.scheduleBlockTable.$inferInsert> = {},
) {
  await db.insert(schema.scheduleBlockTable).values({
    workspaceId,
    userId,
    title: "Visita de obra",
    kind: "fixed",
    plannedDate,
    startMinute: 10 * 60,
    endMinute: 11 * 60,
    ...overrides,
  });
}

async function logClosedTime(taskId: string, userId: string, seconds: number) {
  const startTime = new Date("2026-01-01T09:00:00.000Z");
  await db.insert(schema.timeEntryTable).values({
    taskId,
    userId,
    description: "",
    startTime,
    endTime: new Date(startTime.getTime() + seconds * 1000),
    duration: seconds,
  });
}

function dayKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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
    doneColumnId: fixture.columns.done.id,
    userId: member.user.id,
  };
}

function getPlan(app: App, workspaceId: string, days?: number) {
  const query = days ? `&days=${days}` : "";
  return app.request(`/api/planner?workspaceId=${workspaceId}${query}`);
}

function putOrder(
  app: App,
  workspaceId: string,
  plannedDate: Date,
  taskIds: string[],
) {
  return app.request(`/api/planner/order?workspaceId=${workspaceId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      plannedDate: dayKey(plannedDate),
      taskIds,
    }),
  });
}

beforeEach(async () => {
  await resetTestDatabase();
});

describe("planner: previous (from days before the window, ADR 045)", () => {
  it("lists an undone task planned before the window under 'previous', not 'entries'", async () => {
    const { app, workspaceId, projectId, columnId, userId } = await setup();
    const task = await createTask(projectId, columnId);
    await assign(task.id, userId);
    await planTask(task.id, workspaceId, userId, daysFrom(today(), -3));

    const plan = await (await getPlan(app, workspaceId)).json();

    expect(plan.previous).toHaveLength(1);
    expect(plan.previous[0].id).toBe(task.id);
    expect(plan.entries.some((e: { id: string }) => e.id === task.id)).toBe(
      false,
    );
  });

  it("does not move it by itself: it stays out of today's entries", async () => {
    const { app, workspaceId, projectId, columnId, userId } = await setup();
    const task = await createTask(projectId, columnId);
    await assign(task.id, userId);
    await planTask(task.id, workspaceId, userId, daysFrom(today(), -1));

    const plan = await (await getPlan(app, workspaceId)).json();
    const todayEntries = plan.entries.filter(
      (e: { plannedDate: string }) =>
        e.plannedDate.slice(0, 10) === dayKey(today()),
    );
    expect(todayEntries).toHaveLength(0);
  });

  it("excludes a task that is already done", async () => {
    const { app, workspaceId, projectId, doneColumnId, userId } = await setup();
    const task = await createTask(projectId, doneColumnId, { status: "done" });
    await assign(task.id, userId);
    await planTask(task.id, workspaceId, userId, daysFrom(today(), -5));

    const plan = await (await getPlan(app, workspaceId)).json();
    expect(plan.previous).toHaveLength(0);
  });

  it("carries startMinute and loggedSeconds", async () => {
    const { app, workspaceId, projectId, columnId, userId } = await setup();
    const task = await createTask(projectId, columnId, { estimate: 3600 });
    await assign(task.id, userId);
    await planTask(task.id, workspaceId, userId, daysFrom(today(), -1), {
      startMinute: 9 * 60,
    });
    await logClosedTime(task.id, userId, 1200);

    const plan = await (await getPlan(app, workspaceId)).json();
    expect(plan.previous[0]).toMatchObject({
      startMinute: 9 * 60,
      loggedSeconds: 1200,
    });
  });
});

describe("planner: entries carry startMinute and loggedSeconds (ADR 045)", () => {
  it("reports 0 logged seconds when nothing was tracked", async () => {
    const { app, workspaceId, projectId, columnId, userId } = await setup();
    const task = await createTask(projectId, columnId);
    await assign(task.id, userId);
    await planTask(task.id, workspaceId, userId, today());

    const plan = await (await getPlan(app, workspaceId)).json();
    expect(plan.entries[0]).toMatchObject({
      startMinute: null,
      loggedSeconds: 0,
    });
  });

  it("sums closed time entries for a planned task", async () => {
    const { app, workspaceId, projectId, columnId, userId } = await setup();
    const task = await createTask(projectId, columnId);
    await assign(task.id, userId);
    await planTask(task.id, workspaceId, userId, today());
    await logClosedTime(task.id, userId, 600);
    await logClosedTime(task.id, userId, 300);

    const plan = await (await getPlan(app, workspaceId)).json();
    expect(plan.entries[0].loggedSeconds).toBe(900);
  });
});

describe("planner: deadlines (due within the window, ADR 045)", () => {
  it("lists an assigned undone task due in the window, unplanned", async () => {
    const { app, workspaceId, projectId, columnId, userId } = await setup();
    const dueDate = daysFrom(today(), 2);
    const task = await createTask(projectId, columnId, { dueDate });
    await assign(task.id, userId);

    const plan = await (await getPlan(app, workspaceId)).json();
    expect(plan.deadlines).toHaveLength(1);
    expect(plan.deadlines[0]).toMatchObject({
      id: task.id,
      plannedDate: null,
    });
  });

  it("shows the plannedDate when the task is planned for a different day", async () => {
    const { app, workspaceId, projectId, columnId, userId } = await setup();
    const dueDate = daysFrom(today(), 3);
    const task = await createTask(projectId, columnId, { dueDate });
    await assign(task.id, userId);
    await planTask(task.id, workspaceId, userId, daysFrom(today(), 5));

    const plan = await (await getPlan(app, workspaceId)).json();
    expect(plan.deadlines[0].plannedDate).not.toBeNull();
  });

  it("does not list a task due outside the window", async () => {
    const { app, workspaceId, projectId, columnId, userId } = await setup();
    const task = await createTask(projectId, columnId, {
      dueDate: daysFrom(today(), 40),
    });
    await assign(task.id, userId);

    const plan = await (await getPlan(app, workspaceId)).json();
    expect(plan.deadlines).toHaveLength(0);
  });

  it("does not list a done task even if its due date is in the window", async () => {
    const { app, workspaceId, projectId, doneColumnId, userId } = await setup();
    const task = await createTask(projectId, doneColumnId, {
      status: "done",
      dueDate: daysFrom(today(), 1),
    });
    await assign(task.id, userId);

    const plan = await (await getPlan(app, workspaceId)).json();
    expect(plan.deadlines).toHaveLength(0);
  });
});

describe("planner: fixedBlocksByDay (ADR 045)", () => {
  it("lists a fixed block under its day", async () => {
    const { app, workspaceId, userId } = await setup();
    const day = today();
    await createFixedBlock(workspaceId, userId, day);

    const plan = await (await getPlan(app, workspaceId)).json();
    const blocks = plan.fixedBlocksByDay[dayKey(day)];
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({
      title: "Visita de obra",
      startMinute: 10 * 60,
      endMinute: 11 * 60,
    });
  });

  it("does not list a break block there (it only affects capacity)", async () => {
    const { app, workspaceId, userId } = await setup();
    const day = today();
    await createFixedBlock(workspaceId, userId, day, {
      title: "Comida",
      kind: "break",
      startMinute: 13 * 60,
      endMinute: 14 * 60,
    });

    const plan = await (await getPlan(app, workspaceId)).json();
    expect(plan.fixedBlocksByDay[dayKey(day)]).toHaveLength(0);
  });
});

describe("planner: workspace isolation (regression)", () => {
  it("does not leak a plan entry from another workspace of the same person", async () => {
    const { user, workspace: workspaceA } = await createWorkspaceMember({
      role: "owner",
    });
    const fixtureA = await createProjectFixture({ workspaceId: workspaceA.id });
    const taskA = await createTask(
      fixtureA.project.id,
      fixtureA.columns.todo.id,
      { title: "Tarea del espacio A" },
    );
    await assign(taskA.id, user.id);
    await planTask(taskA.id, workspaceA.id, user.id, today());

    // El mismo usuario, ahora tambien en un segundo espacio.
    const { workspace: workspaceB } = await createWorkspaceMember({
      role: "owner",
      user,
    });
    await createProjectFixture({ workspaceId: workspaceB.id });

    const app = asUser(user);
    const planB = await (await getPlan(app, workspaceB.id)).json();

    expect(planB.entries.some((e: { id: string }) => e.id === taskA.id)).toBe(
      false,
    );
    expect(planB.unplanned.some((e: { id: string }) => e.id === taskA.id)).toBe(
      false,
    );
  });
});

describe("PUT /planner/order", () => {
  it("rewrites positions to match the given order", async () => {
    const { app, workspaceId, projectId, columnId, userId } = await setup();
    const day = today();
    const first = await createTask(projectId, columnId, {
      title: "Primera",
      number: 1,
    });
    const second = await createTask(projectId, columnId, {
      title: "Segunda",
      number: 2,
    });
    await assign(first.id, userId);
    await assign(second.id, userId);
    await planTask(first.id, workspaceId, userId, day, { position: 0 });
    await planTask(second.id, workspaceId, userId, day, { position: 1 });

    const response = await putOrder(app, workspaceId, day, [
      second.id,
      first.id,
    ]);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ updated: 2 });

    const plan = await (await getPlan(app, workspaceId)).json();
    const ids = plan.entries
      .filter(
        (e: { plannedDate: string }) =>
          e.plannedDate.slice(0, 10) === dayKey(day),
      )
      .sort(
        (a: { position: number }, b: { position: number }) =>
          a.position - b.position,
      )
      .map((e: { id: string }) => e.id);
    expect(ids).toEqual([second.id, first.id]);
  });

  it("ignores an id that is not planned that day, without failing the rest", async () => {
    const { app, workspaceId, projectId, columnId, userId } = await setup();
    const day = today();
    const task = await createTask(projectId, columnId);
    await assign(task.id, userId);
    await planTask(task.id, workspaceId, userId, day);

    const response = await putOrder(app, workspaceId, day, [
      "not-a-real-task",
      task.id,
    ]);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ updated: 1 });
  });

  it("does not let someone reorder another person's plan", async () => {
    const { user: owner, workspace } = await createWorkspaceMember({
      role: "owner",
    });
    const other = await addMember(workspace.id, "member");
    const { project, columns } = await createProjectFixture({
      workspaceId: workspace.id,
    });
    const task = await createTask(project.id, columns.todo.id);
    await assign(task.id, owner.id);
    await planTask(task.id, workspace.id, owner.id, today());

    const otherApp = asUser(other);
    const response = await putOrder(otherApp, workspace.id, today(), [task.id]);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ updated: 0 });

    const [entry] = await db
      .select()
      .from(schema.personalPlanEntryTable)
      .where(eq(schema.personalPlanEntryTable.taskId, task.id));
    expect(entry?.position).toBe(0);
  });
});
