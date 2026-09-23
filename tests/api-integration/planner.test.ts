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

async function assign(taskId: string, userId: string) {
  await db.insert(schema.taskAssigneeTable).values({ taskId, userId });
}

async function seedRecurrence({
  projectId,
  createdBy,
  assigneeId,
  cadence = { frequency: "daily", interval: 1 },
  nextRunAt = new Date(),
  endsAt = null,
}: {
  projectId: string;
  createdBy: string;
  assigneeId: string;
  cadence?: Record<string, unknown>;
  nextRunAt?: Date;
  endsAt?: Date | null;
}) {
  const [row] = await db
    .insert(schema.taskRecurrenceTable)
    .values({
      projectId,
      createdBy,
      template: { title: "Parte semanal", priority: "medium", assigneeId },
      cadence,
      nextRunAt,
      endsAt,
      active: true,
    })
    .returning();

  return row;
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

function getPlan(app: App, workspaceId: string, days?: number) {
  const query = days ? `&days=${days}` : "";
  return app.request(`/api/planner?workspaceId=${workspaceId}${query}`);
}

function putEntry(
  app: App,
  workspaceId: string,
  taskId: string,
  body: Record<string, unknown>,
) {
  return app.request(`/api/planner/${taskId}?workspaceId=${workspaceId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function deleteEntry(app: App, workspaceId: string, taskId: string) {
  return app.request(`/api/planner/${taskId}?workspaceId=${workspaceId}`, {
    method: "DELETE",
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
    userId: member.user.id,
  };
}

describe("personal planner", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  it("places a task on a day without touching its due date", async () => {
    const { app, workspaceId, projectId, columnId, userId } = await setup();
    const dueDate = new Date("2026-01-05T00:00:00.000Z");
    const task = await createTask(projectId, columnId, { dueDate });
    await assign(task.id, userId);

    const plannedDate = new Date();
    plannedDate.setHours(0, 0, 0, 0);

    const response = await putEntry(app, workspaceId, task.id, {
      plannedDate: plannedDate.toISOString(),
      position: 0,
    });

    expect(response.status).toBe(200);

    // La invariante de la ADR 040: nada aqui escribe en `task`.
    const [reloaded] = await db
      .select({ dueDate: schema.taskTable.dueDate })
      .from(schema.taskTable)
      .where(eq(schema.taskTable.id, task.id));
    expect(reloaded?.dueDate?.toISOString()).toBe(dueDate.toISOString());
  });

  it("lists a planned task inside the window and clears unplanned", async () => {
    const { app, workspaceId, projectId, columnId, userId } = await setup();
    const task = await createTask(projectId, columnId);
    await assign(task.id, userId);

    const before = await (await getPlan(app, workspaceId)).json();
    expect(before.unplanned.map((t: { id: string }) => t.id)).toContain(
      task.id,
    );
    expect(before.entries).toHaveLength(0);

    const plannedDate = new Date();
    plannedDate.setHours(0, 0, 0, 0);
    await putEntry(app, workspaceId, task.id, {
      plannedDate: plannedDate.toISOString(),
    });

    const after = await (await getPlan(app, workspaceId)).json();
    expect(after.entries.map((t: { id: string }) => t.id)).toContain(task.id);
    expect(after.unplanned.map((t: { id: string }) => t.id)).not.toContain(
      task.id,
    );
  });

  it("keeps a task out of unplanned even when its plan entry falls outside the window", async () => {
    const { app, workspaceId, projectId, columnId, userId } = await setup();
    const task = await createTask(projectId, columnId);
    await assign(task.id, userId);

    const farFuture = new Date();
    farFuture.setDate(farFuture.getDate() + 40);
    await putEntry(app, workspaceId, task.id, {
      plannedDate: farFuture.toISOString(),
    });

    // Ventana por defecto: 15 dias, no llega a los 40.
    const plan = await (await getPlan(app, workspaceId)).json();
    expect(plan.entries.map((t: { id: string }) => t.id)).not.toContain(
      task.id,
    );
    expect(plan.unplanned.map((t: { id: string }) => t.id)).not.toContain(
      task.id,
    );
  });

  it("moves a task by upserting instead of duplicating the row", async () => {
    const { app, workspaceId, projectId, columnId, userId } = await setup();
    const task = await createTask(projectId, columnId);
    await assign(task.id, userId);

    const day1 = new Date();
    day1.setHours(0, 0, 0, 0);
    const day2 = new Date(day1);
    day2.setDate(day2.getDate() + 1);

    await putEntry(app, workspaceId, task.id, {
      plannedDate: day1.toISOString(),
    });
    await putEntry(app, workspaceId, task.id, {
      plannedDate: day2.toISOString(),
    });

    const rows = await db
      .select()
      .from(schema.personalPlanEntryTable)
      .where(eq(schema.personalPlanEntryTable.taskId, task.id));

    expect(rows).toHaveLength(1);
    expect(rows[0]?.plannedDate.toISOString()).toBe(day2.toISOString());
  });

  it("plans and anchors a task to a clock time in a single call", async () => {
    const { app, workspaceId, projectId, columnId, userId } = await setup();
    const task = await createTask(projectId, columnId);
    await assign(task.id, userId);

    const day = new Date();
    day.setHours(0, 0, 0, 0);

    const response = await putEntry(app, workspaceId, task.id, {
      plannedDate: day.toISOString(),
      startMinute: 9 * 60,
    });
    expect(response.status).toBe(200);

    const [row] = await db
      .select()
      .from(schema.personalPlanEntryTable)
      .where(eq(schema.personalPlanEntryTable.taskId, task.id));
    expect(row?.startMinute).toBe(9 * 60);
  });

  it("moving a task without startMinute leaves an existing anchor untouched", async () => {
    const { app, workspaceId, projectId, columnId, userId } = await setup();
    const task = await createTask(projectId, columnId);
    await assign(task.id, userId);

    const day1 = new Date();
    day1.setHours(0, 0, 0, 0);
    const day2 = new Date(day1);
    day2.setDate(day2.getDate() + 1);

    await putEntry(app, workspaceId, task.id, {
      plannedDate: day1.toISOString(),
      startMinute: 10 * 60,
    });
    // Sin `startMinute`: mover de dia en el Planificador no debe desanclar
    // una hora puesta desde el Cronograma.
    await putEntry(app, workspaceId, task.id, {
      plannedDate: day2.toISOString(),
    });

    const [row] = await db
      .select()
      .from(schema.personalPlanEntryTable)
      .where(eq(schema.personalPlanEntryTable.taskId, task.id));
    expect(row?.startMinute).toBe(10 * 60);
    expect(row?.plannedDate.toISOString()).toBe(day2.toISOString());
  });

  it("rejects a plan entry startMinute of 1440 with 400, not 500", async () => {
    const { app, workspaceId, projectId, columnId, userId } = await setup();
    const task = await createTask(projectId, columnId);
    await assign(task.id, userId);

    const response = await putEntry(app, workspaceId, task.id, {
      plannedDate: new Date().toISOString(),
      startMinute: 1440,
    });
    expect(response.status).toBe(400);
  });

  it("refuses to plan a task from another workspace", async () => {
    const { app, workspaceId } = await setup();
    const other = await createWorkspaceMember({ role: "member" });
    const otherFixture = await createProjectFixture({
      workspaceId: other.workspace.id,
    });
    const foreignTask = await createTask(
      otherFixture.project.id,
      otherFixture.columns.todo.id,
    );

    const response = await putEntry(app, workspaceId, foreignTask.id, {
      plannedDate: new Date().toISOString(),
    });

    expect(response.status).toBe(404);
  });

  it("sends a task back to unplanned on delete", async () => {
    const { app, workspaceId, projectId, columnId, userId } = await setup();
    const task = await createTask(projectId, columnId);
    await assign(task.id, userId);

    const plannedDate = new Date();
    plannedDate.setHours(0, 0, 0, 0);
    await putEntry(app, workspaceId, task.id, {
      plannedDate: plannedDate.toISOString(),
    });

    const response = await deleteEntry(app, workspaceId, task.id);
    expect(response.status).toBe(200);

    const plan = await (await getPlan(app, workspaceId)).json();
    expect(plan.unplanned.map((t: { id: string }) => t.id)).toContain(task.id);
    expect(plan.entries).toHaveLength(0);
  });

  it("does not list a done task as unplanned", async () => {
    const { app, workspaceId, projectId, columnId, userId } = await setup();
    const task = await createTask(projectId, columnId, { status: "done" });
    await assign(task.id, userId);

    const plan = await (await getPlan(app, workspaceId)).json();
    expect(plan.unplanned.map((t: { id: string }) => t.id)).not.toContain(
      task.id,
    );
  });

  it("projects a ghost for an active recurrence assigned to the viewer", async () => {
    const { app, workspaceId, projectId, userId } = await setup();
    await seedRecurrence({ projectId, createdBy: userId, assigneeId: userId });

    const plan = await (await getPlan(app, workspaceId)).json();

    expect(plan.ghosts.length).toBeGreaterThan(0);
    expect(plan.ghosts[0].title).toBe("Parte semanal");
    // Los fantasmas no cuentan tarea real: no tienen fila que arrastrar.
    expect(plan.entries).toHaveLength(0);
  });

  it("does not project a ghost assigned to someone else", async () => {
    const { app, workspaceId, projectId, userId } = await setup();
    const other = await createWorkspaceMember({ role: "member" });
    await seedRecurrence({
      projectId,
      createdBy: userId,
      assigneeId: other.user.id,
    });

    const plan = await (await getPlan(app, workspaceId)).json();
    expect(plan.ghosts).toHaveLength(0);
  });

  it("reports the fixed 8-hour capacity", async () => {
    const { app, workspaceId } = await setup();
    const plan = await (await getPlan(app, workspaceId)).json();
    expect(plan.capacitySeconds).toBe(8 * 60 * 60);
  });

  it("someone outside the workspace cannot read its plan", async () => {
    const { workspaceId } = await setup();
    const outsider = await createWorkspaceMember({ role: "member" });
    const outsiderApp = asUser(outsider.user);

    const response = await getPlan(outsiderApp, workspaceId);
    expect(response.status).toBe(403);
  });

  it("cannot remove a plan entry through another workspace of the same person", async () => {
    const { app, workspaceId, projectId, columnId, userId } = await setup();
    const task = await createTask(projectId, columnId);
    await assign(task.id, userId);

    const plannedDate = new Date();
    plannedDate.setHours(0, 0, 0, 0);
    await putEntry(app, workspaceId, task.id, {
      plannedDate: plannedDate.toISOString(),
    });

    const otherWorkspace = await addToAnotherWorkspace(userId);
    const response = await deleteEntry(app, otherWorkspace.id, task.id);
    expect(response.status).toBe(404);

    const rows = await db
      .select()
      .from(schema.personalPlanEntryTable)
      .where(eq(schema.personalPlanEntryTable.taskId, task.id));
    expect(rows).toHaveLength(1);
  });

  it("excludes a task in an archived project from unplanned", async () => {
    const { app, workspaceId, projectId, columnId, userId } = await setup();
    const task = await createTask(projectId, columnId);
    await assign(task.id, userId);

    await db
      .update(schema.projectTable)
      .set({ archivedAt: new Date() })
      .where(eq(schema.projectTable.id, projectId));

    const plan = await (await getPlan(app, workspaceId)).json();
    expect(plan.unplanned.map((t: { id: string }) => t.id)).not.toContain(
      task.id,
    );
  });

  it("does not project a ghost for an occurrence the generator already created", async () => {
    const { app, workspaceId, projectId, userId } = await setup();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const nextRunAt = new Date(today);
    nextRunAt.setDate(nextRunAt.getDate() + 2);

    await seedRecurrence({
      projectId,
      createdBy: userId,
      assigneeId: userId,
      nextRunAt,
    });

    const plan = await (await getPlan(app, workspaceId)).json();
    const ghostTimes = plan.ghosts.map((g: { plannedDate: string }) =>
      new Date(g.plannedDate).getTime(),
    );

    expect(ghostTimes.length).toBeGreaterThan(0);
    expect(Math.min(...ghostTimes)).toBe(nextRunAt.getTime());
  });

  it("does not project a ghost past an ended recurrence", async () => {
    const { app, workspaceId, projectId, userId } = await setup();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const endsAt = new Date(today);
    endsAt.setDate(endsAt.getDate() - 1);
    const nextRunAt = new Date(today);
    nextRunAt.setDate(nextRunAt.getDate() - 5);

    await seedRecurrence({
      projectId,
      createdBy: userId,
      assigneeId: userId,
      nextRunAt,
      endsAt,
    });

    const plan = await (await getPlan(app, workspaceId)).json();
    expect(plan.ghosts).toHaveLength(0);
  });
});
