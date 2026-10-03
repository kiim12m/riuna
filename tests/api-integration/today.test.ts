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

async function assign(taskId: string, userId: string) {
  await db.insert(schema.taskAssigneeTable).values({ taskId, userId });
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

function getToday(app: App, workspaceId: string) {
  return app.request(`/api/today?workspaceId=${workspaceId}`);
}

beforeEach(async () => {
  await resetTestDatabase();
});

describe("GET /today (ADR 046)", () => {
  it("lists a task planned yesterday, undone, under previous", async () => {
    const { app, workspaceId, projectId, columnId, userId } = await setup();
    const task = await createTask(projectId, columnId);
    await assign(task.id, userId);
    await planTask(task.id, workspaceId, userId, daysFrom(today(), -2));

    const body = await (await getToday(app, workspaceId)).json();
    expect(body.previous).toHaveLength(1);
    expect(body.previous[0].id).toBe(task.id);
    expect(body.planned.some((t: { id: string }) => t.id === task.id)).toBe(
      false,
    );
  });

  it("lists a task planned today under planned, with startMinute and loggedSeconds", async () => {
    const { app, workspaceId, projectId, columnId, userId } = await setup();
    const task = await createTask(projectId, columnId, { estimate: 3600 });
    await assign(task.id, userId);
    await planTask(task.id, workspaceId, userId, today());
    await logClosedTime(task.id, userId, 900);

    const body = await (await getToday(app, workspaceId)).json();
    expect(body.planned).toHaveLength(1);
    expect(body.planned[0]).toMatchObject({
      id: task.id,
      startMinute: null,
      loggedSeconds: 900,
    });
  });

  it("lists an overdue assigned task, unplanned, under urgent, with dueWindow", async () => {
    const { app, workspaceId, projectId, columnId, userId } = await setup();
    const task = await createTask(projectId, columnId, {
      dueDate: daysFrom(today(), -3),
    });
    await assign(task.id, userId);

    const body = await (await getToday(app, workspaceId)).json();
    expect(body.urgent).toHaveLength(1);
    expect(body.urgent[0]).toMatchObject({
      id: task.id,
      plannedDate: null,
      dueWindow: "overdue",
    });
  });

  it("classifies a task due today as dueWindow 'today', not 'overdue'", async () => {
    const { app, workspaceId, projectId, columnId, userId } = await setup();
    const task = await createTask(projectId, columnId, { dueDate: today() });
    await assign(task.id, userId);

    const body = await (await getToday(app, workspaceId)).json();
    expect(body.urgent).toHaveLength(1);
    expect(body.urgent[0].dueWindow).toBe("today");
  });

  it("excludes from urgent a task already planned for today or before", async () => {
    const { app, workspaceId, projectId, columnId, userId } = await setup();
    const task = await createTask(projectId, columnId, {
      dueDate: daysFrom(today(), -1),
    });
    await assign(task.id, userId);
    await planTask(task.id, workspaceId, userId, today());

    const body = await (await getToday(app, workspaceId)).json();
    expect(body.urgent).toHaveLength(0);
    expect(body.planned).toHaveLength(1);
  });

  it("keeps a task in urgent, with its plannedDate, when planned for a future day", async () => {
    const { app, workspaceId, projectId, columnId, userId } = await setup();
    const task = await createTask(projectId, columnId, {
      dueDate: today(),
    });
    await assign(task.id, userId);
    await planTask(task.id, workspaceId, userId, daysFrom(today(), 3));

    const body = await (await getToday(app, workspaceId)).json();
    expect(body.urgent).toHaveLength(1);
    expect(body.urgent[0].plannedDate).not.toBeNull();
  });

  it("does not list a task due next week under urgent", async () => {
    const { app, workspaceId, projectId, columnId, userId } = await setup();
    const task = await createTask(projectId, columnId, {
      dueDate: daysFrom(today(), 10),
    });
    await assign(task.id, userId);

    const body = await (await getToday(app, workspaceId)).json();
    expect(body.urgent).toHaveLength(0);
  });

  it("does not list an overdue task from an archived project under urgent", async () => {
    const { app, workspaceId, projectId, columnId, userId } = await setup();
    const task = await createTask(projectId, columnId, {
      dueDate: daysFrom(today(), -1),
    });
    await assign(task.id, userId);
    await db
      .update(schema.projectTable)
      .set({ archivedAt: new Date() })
      .where(eq(schema.projectTable.id, projectId));

    const body = await (await getToday(app, workspaceId)).json();
    expect(body.urgent).toHaveLength(0);
  });

  it("does not list an archived-status task under urgent even if its due date is overdue", async () => {
    const { app, workspaceId, projectId, columnId, userId } = await setup();
    const task = await createTask(projectId, columnId, {
      dueDate: daysFrom(today(), -1),
      status: "archived",
    });
    await assign(task.id, userId);

    const body = await (await getToday(app, workspaceId)).json();
    expect(body.urgent).toHaveLength(0);
  });

  it("lists a task finished today that was assigned, with what was logged on it", async () => {
    const { app, workspaceId, projectId, doneColumnId, userId } = await setup();
    const task = await createTask(projectId, doneColumnId, { status: "done" });
    await assign(task.id, userId);
    await logClosedTime(task.id, userId, 1800);

    const body = await (await getToday(app, workspaceId)).json();
    expect(body.done).toHaveLength(1);
    expect(body.done[0]).toMatchObject({ id: task.id, loggedSeconds: 1800 });
  });

  it("lists a task finished today that was planned for today, even if assigned to someone else", async () => {
    const { app, workspaceId, projectId, doneColumnId, userId } = await setup();
    const other = await addMember(workspaceId, "member");
    const task = await createTask(projectId, doneColumnId, {
      status: "done",
    });
    await assign(task.id, other.id);
    await planTask(task.id, workspaceId, userId, today());

    const body = await (await getToday(app, workspaceId)).json();
    expect(body.done.some((t: { id: string }) => t.id === task.id)).toBe(true);
  });

  it("does not list a task finished today that is neither assigned nor planned by this user", async () => {
    const { app, workspaceId, projectId, doneColumnId } = await setup();
    const other = await addMember(workspaceId, "member");
    const task = await createTask(projectId, doneColumnId, {
      status: "done",
    });
    await assign(task.id, other.id);

    const body = await (await getToday(app, workspaceId)).json();
    expect(body.done.some((t: { id: string }) => t.id === task.id)).toBe(false);
  });

  it("computes estimateRemaining from planned tasks only", async () => {
    const { app, workspaceId, projectId, columnId, userId } = await setup();
    const planned = await createTask(projectId, columnId, {
      estimate: 3600,
      title: "Planificada",
    });
    const urgent = await createTask(projectId, columnId, {
      estimate: 7200,
      title: "Urgente",
      number: 2,
      dueDate: today(),
    });
    await assign(planned.id, userId);
    await assign(urgent.id, userId);
    await planTask(planned.id, workspaceId, userId, today());
    await logClosedTime(planned.id, userId, 600);

    const body = await (await getToday(app, workspaceId)).json();
    // 3600 - 600 = 3000; la urgente sin planificar no cuenta.
    expect(body.totals.estimateRemaining).toBe(3000);
  });

  it("computes workedToday across every task, not just planned ones", async () => {
    const { app, workspaceId, projectId, columnId, userId } = await setup();
    const planned = await createTask(projectId, columnId, { title: "A" });
    const other = await createTask(projectId, columnId, {
      title: "B",
      number: 2,
    });
    await assign(planned.id, userId);
    await assign(other.id, userId);
    await planTask(planned.id, workspaceId, userId, today());

    const now = new Date();
    await db.insert(schema.timeEntryTable).values([
      {
        taskId: planned.id,
        userId,
        description: "",
        startTime: new Date(now.getTime() - 600 * 1000),
        endTime: now,
        duration: 600,
      },
      {
        taskId: other.id,
        userId,
        description: "",
        startTime: new Date(now.getTime() - 300 * 1000),
        endTime: now,
        duration: 300,
      },
    ]);

    const body = await (await getToday(app, workspaceId)).json();
    expect(body.totals.workedToday).toBe(900);
  });

  it("reports the default 8-hour capacity for today", async () => {
    const { app, workspaceId } = await setup();
    const body = await (await getToday(app, workspaceId)).json();
    // La jornada por defecto es de lunes a viernes (ADR 045): en fin de
    // semana, hoy no tiene horas. Sin esto la prueba fallaba los sabados.
    const weekday = new Date().getDay();
    expect(body.totals.capacitySeconds).toBe(
      weekday >= 1 && weekday <= 5 ? 8 * 60 * 60 : 0,
    );
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
    const body = await (await getToday(app, workspaceB.id)).json();
    expect(body.planned.some((t: { id: string }) => t.id === task.id)).toBe(
      false,
    );
  });
});
