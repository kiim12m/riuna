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

let taskCounter = 0;

async function createTask(
  projectId: string,
  columnId: string,
  overrides: Partial<typeof schema.taskTable.$inferInsert> = {},
) {
  taskCounter += 1;
  const [task] = await db
    .insert(schema.taskTable)
    .values({
      ...taskTreeValues(),
      projectId,
      title: "Revisar cuadro electrico",
      status: "to-do",
      columnId,
      priority: "medium",
      number: taskCounter,
      position: taskCounter,
      ...overrides,
    })
    .returning();
  if (!task) throw new Error("Failed to seed task");
  return task;
}

async function assign(taskId: string, userId: string) {
  await db.insert(schema.taskAssigneeTable).values({ taskId, userId });
}

async function createManyAssignedTasks(
  projectId: string,
  columnId: string,
  assigneeId: string,
  count: number,
) {
  const values = Array.from({ length: count }, () => {
    taskCounter += 1;
    return {
      ...taskTreeValues(),
      projectId,
      columnId,
      title: `Tarea ${taskCounter}`,
      status: "to-do",
      priority: "medium",
      number: taskCounter,
      position: taskCounter,
    };
  });

  const inserted = await db
    .insert(schema.taskTable)
    .values(values)
    .returning({ id: schema.taskTable.id });

  await db
    .insert(schema.taskAssigneeTable)
    .values(inserted.map((task) => ({ taskId: task.id, userId: assigneeId })));
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
) {
  await db.insert(schema.personalPlanEntryTable).values({
    workspaceId,
    userId,
    taskId,
    plannedDate,
    position: 0,
  });
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

function getCounts(app: App, workspaceId: string) {
  return app.request(`/api/my-work/counts?workspaceId=${workspaceId}`);
}

beforeEach(async () => {
  await resetTestDatabase();
  taskCounter = 0;
});

describe("GET /my-work/counts (ADR 046)", () => {
  it("counts previous, planned and urgent tasks together under today", async () => {
    const { app, workspaceId, projectId, columnId, userId } = await setup();

    const previous = await createTask(projectId, columnId, { number: 1 });
    await assign(previous.id, userId);
    await planTask(previous.id, workspaceId, userId, daysFrom(today(), -2));

    const planned = await createTask(projectId, columnId, { number: 2 });
    await assign(planned.id, userId);
    await planTask(planned.id, workspaceId, userId, today());

    const urgent = await createTask(projectId, columnId, {
      number: 3,
      dueDate: daysFrom(today(), -1),
    });
    await assign(urgent.id, userId);

    const body = await (await getCounts(app, workspaceId)).json();
    expect(body.today).toBe(3);
  });

  it("does not count a task due next week under today", async () => {
    const { app, workspaceId, projectId, columnId, userId } = await setup();
    const task = await createTask(projectId, columnId, {
      dueDate: daysFrom(today(), 10),
    });
    await assign(task.id, userId);

    const body = await (await getCounts(app, workspaceId)).json();
    expect(body.today).toBe(0);
  });

  it("does not count a task finished today under today", async () => {
    const { app, workspaceId, projectId, doneColumnId, userId } = await setup();
    const task = await createTask(projectId, doneColumnId, {
      status: "done",
    });
    await assign(task.id, userId);

    const body = await (await getCounts(app, workspaceId)).json();
    expect(body.today).toBe(0);
  });

  it("counts assigned, unfinished tasks across every project under myTasks", async () => {
    const { app, workspaceId, projectId, columnId, doneColumnId, userId } =
      await setup();
    const other = await createProjectFixture({ workspaceId, name: "Otro" });

    const open = await createTask(projectId, columnId, { number: 1 });
    await assign(open.id, userId);
    const openElsewhere = await createTask(
      other.project.id,
      other.columns.todo.id,
      {
        number: 2,
      },
    );
    await assign(openElsewhere.id, userId);
    const done = await createTask(projectId, doneColumnId, {
      number: 3,
      status: "done",
    });
    await assign(done.id, userId);

    const body = await (await getCounts(app, workspaceId)).json();
    expect(body.myTasks).toBe(2);
  });

  it("does not count a task assigned to someone else under myTasks", async () => {
    const { app, workspaceId, projectId, columnId } = await setup();
    const other = await createWorkspaceMember({ role: "member" });
    const task = await createTask(projectId, columnId);
    await assign(task.id, other.user.id);

    const body = await (await getCounts(app, workspaceId)).json();
    expect(body.myTasks).toBe(0);
  });

  it("tops myTasks at 500", async () => {
    const { app, workspaceId, projectId, columnId, userId } = await setup();
    await createManyAssignedTasks(projectId, columnId, userId, 510);

    const body = await (await getCounts(app, workspaceId)).json();
    expect(body.myTasks).toBe(500);
  });

  it("does not leak a plan entry from another workspace of the same person", async () => {
    const { user, workspace: workspaceA } = await createWorkspaceMember({
      role: "owner",
    });
    const fixtureA = await createProjectFixture({ workspaceId: workspaceA.id });
    const task = await createTask(
      fixtureA.project.id,
      fixtureA.columns.todo.id,
      { title: "Del espacio A" },
    );
    await assign(task.id, user.id);
    await planTask(task.id, workspaceA.id, user.id, today());

    const { workspace: workspaceB } = await createWorkspaceMember({
      role: "owner",
      user,
    });
    await createProjectFixture({ workspaceId: workspaceB.id });

    const app = asUser(user);
    const body = await (await getCounts(app, workspaceB.id)).json();
    expect(body.today).toBe(0);
    expect(body.myTasks).toBe(0);
  });

  it("returns the server's today as yyyy-mm-dd", async () => {
    const { app, workspaceId } = await setup();
    const body = await (await getCounts(app, workspaceId)).json();
    expect(body.serverToday).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
