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

type Cycle = {
  id: string;
  name: string;
  status: string;
  closedAt: string | null;
  taskCount: number;
  doneTaskCount: number;
  estimateSeconds: number;
  doneEstimateSeconds: number;
};

type Report = {
  summary: {
    totalTasks: number;
    doneTasks: number;
    estimateSeconds: number;
    doneEstimateSeconds: number;
    loggedSeconds: number;
  };
  burndown: Array<{
    day: string;
    remainingTasks: number | null;
    idealTasks: number;
  }>;
  hoursByPerson: Array<{ userId: string | null; seconds: number }>;
};

const DAY = 86_400_000;

let taskCounter = 0;

async function createTask({
  projectId,
  title,
  status = "to-do",
  cycleId,
  estimate,
}: {
  projectId: string;
  title: string;
  status?: string;
  cycleId?: string;
  estimate?: number;
}) {
  taskCounter += 1;

  const [task] = await db
    .insert(schema.taskTable)
    .values({
      ...taskTreeValues(),
      projectId,
      title,
      status,
      priority: "medium",
      number: taskCounter,
      position: taskCounter,
      cycleId: cycleId ?? null,
      estimate: estimate ?? null,
    })
    .returning();

  return task;
}

async function createCycleRow({
  projectId,
  name = "Sprint",
  status = "planned",
  start = new Date(Date.now() - 3 * DAY),
  end = new Date(Date.now() + 4 * DAY),
}: {
  projectId: string;
  name?: string;
  status?: string;
  start?: Date;
  end?: Date;
}) {
  const [cycle] = await db
    .insert(schema.cycleTable)
    .values({ projectId, name, status, startDate: start, endDate: end })
    .returning();

  return cycle;
}

describe("API integration: cycles", () => {
  beforeEach(async () => {
    await resetTestDatabase();
    taskCounter = 0;
  });

  // El disparador es logica nueva en un sitio nuevo, y es lo que sostiene todo
  // lo demas: si `completed_at` miente, la velocidad y el burndown mienten.
  it("stamps and clears completed_at through the API, not just through SQL", async () => {
    const member = await createWorkspaceMember({ role: "admin" });
    const { project, columns } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });
    const task = await createTask({ projectId: project.id, title: "Una" });

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const read = async () => {
      const [row] = await db
        .select({ completedAt: schema.taskTable.completedAt })
        .from(schema.taskTable)
        .where(eq(schema.taskTable.id, task.id));
      return row.completedAt;
    };

    expect(await read()).toBeNull();

    const done = await app.request(`/api/task/status/${task.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: columns.done.slug }),
    });
    expect(done.status).toBe(200);
    expect(await read()).not.toBeNull();

    const reopened = await app.request(`/api/task/status/${task.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: columns.todo.slug }),
    });
    expect(reopened.status).toBe(200);
    expect(await read()).toBeNull();
  });

  it("refuses a second active cycle in the same project", async () => {
    const member = await createWorkspaceMember({ role: "admin" });
    const { project } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });
    const first = await createCycleRow({
      projectId: project.id,
      name: "Sprint 1",
      status: "active",
    });
    const second = await createCycleRow({
      projectId: project.id,
      name: "Sprint 2",
    });

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const response = await app.request(`/api/cycle/${second.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "active" }),
    });

    expect(response.status).toBe(409);

    const [stored] = await db
      .select({ status: schema.cycleTable.status })
      .from(schema.cycleTable)
      .where(eq(schema.cycleTable.id, second.id));
    expect(stored.status).toBe("planned");
    expect(first.status).toBe("active");
  });

  it("keeps finished tasks and sends the unfinished ones back to the backlog", async () => {
    const member = await createWorkspaceMember({ role: "admin" });
    const { project, columns } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });
    const cycle = await createCycleRow({
      projectId: project.id,
      status: "active",
    });

    const done = await createTask({
      projectId: project.id,
      title: "Terminada",
      status: columns.done.slug,
      cycleId: cycle.id,
    });
    const pending = await createTask({
      projectId: project.id,
      title: "Pendiente",
      cycleId: cycle.id,
    });

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const response = await app.request(`/api/cycle/${cycle.id}/close`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ unfinished: "backlog" }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      movedTaskCount: 1,
      movedTo: null,
    });

    const rows = await db
      .select({ id: schema.taskTable.id, cycleId: schema.taskTable.cycleId })
      .from(schema.taskTable);
    const byId = new Map(rows.map((row) => [row.id, row.cycleId]));

    // Lo terminado se queda: es exactamente lo que la velocidad mide.
    expect(byId.get(done.id)).toBe(cycle.id);
    expect(byId.get(pending.id)).toBeNull();

    const [stored] = await db
      .select({
        status: schema.cycleTable.status,
        closedAt: schema.cycleTable.closedAt,
      })
      .from(schema.cycleTable)
      .where(eq(schema.cycleTable.id, cycle.id));
    expect(stored.status).toBe("closed");
    expect(stored.closedAt).not.toBeNull();
  });

  it("moves the unfinished tasks to the next cycle when asked", async () => {
    const member = await createWorkspaceMember({ role: "admin" });
    const { project } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });
    const current = await createCycleRow({
      projectId: project.id,
      name: "Sprint 1",
      status: "active",
    });
    const next = await createCycleRow({
      projectId: project.id,
      name: "Sprint 2",
    });
    const pending = await createTask({
      projectId: project.id,
      title: "Se arrastra",
      cycleId: current.id,
    });

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const response = await app.request(`/api/cycle/${current.id}/close`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ unfinished: "cycle", targetCycleId: next.id }),
    });

    expect(response.status).toBe(200);

    const [stored] = await db
      .select({ cycleId: schema.taskTable.cycleId })
      .from(schema.taskTable)
      .where(eq(schema.taskTable.id, pending.id));
    expect(stored.cycleId).toBe(next.id);
  });

  it("refuses a target cycle from another project and closing twice", async () => {
    const member = await createWorkspaceMember({ role: "admin" });
    const mine = await createProjectFixture({
      workspaceId: member.workspace.id,
      name: "Mio",
    });
    const other = await createProjectFixture({
      workspaceId: member.workspace.id,
      name: "Otro",
    });
    const cycle = await createCycleRow({
      projectId: mine.project.id,
      status: "active",
    });
    const foreign = await createCycleRow({ projectId: other.project.id });

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const crossProject = await app.request(`/api/cycle/${cycle.id}/close`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ unfinished: "cycle", targetCycleId: foreign.id }),
    });
    expect(crossProject.status).toBe(400);

    const first = await app.request(`/api/cycle/${cycle.id}/close`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ unfinished: "backlog" }),
    });
    expect(first.status).toBe(200);

    const second = await app.request(`/api/cycle/${cycle.id}/close`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ unfinished: "backlog" }),
    });
    expect(second.status).toBe(400);
  });

  it("refuses putting a task into a cycle of another project", async () => {
    const member = await createWorkspaceMember({ role: "admin" });
    const mine = await createProjectFixture({
      workspaceId: member.workspace.id,
      name: "Mio",
    });
    const other = await createProjectFixture({
      workspaceId: member.workspace.id,
      name: "Otro",
    });
    const foreign = await createCycleRow({ projectId: other.project.id });
    const task = await createTask({
      projectId: mine.project.id,
      title: "Una",
    });

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const response = await app.request(`/api/cycle/task/${task.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cycleId: foreign.id }),
    });

    expect(response.status).toBe(400);
  });

  // El criterio de aceptacion de la fase, entero.
  it("reports velocity, a burndown and hours per person", async () => {
    const member = await createWorkspaceMember({ role: "admin" });
    const { project, columns } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });
    const start = new Date(Date.now() - 3 * DAY);
    const end = new Date(Date.now() + 3 * DAY);
    const cycle = await createCycleRow({
      projectId: project.id,
      status: "active",
      start,
      end,
    });

    // Dos horas estimadas terminadas, una pendiente.
    const doneA = await createTask({
      projectId: project.id,
      title: "Hecha A",
      status: columns.done.slug,
      cycleId: cycle.id,
      estimate: 3600,
    });
    await createTask({
      projectId: project.id,
      title: "Hecha B",
      status: columns.done.slug,
      cycleId: cycle.id,
      estimate: 3600,
    });
    await createTask({
      projectId: project.id,
      title: "Pendiente",
      cycleId: cycle.id,
      estimate: 7200,
    });
    // Archivada: no cuenta en ningun agregado, misma regla que el arbol.
    await createTask({
      projectId: project.id,
      title: "Archivada",
      status: "archived",
      cycleId: cycle.id,
      estimate: 9999,
    });

    await db.insert(schema.timeEntryTable).values({
      id: `te-${randomUUID()}`,
      taskId: doneA.id,
      userId: member.user.id,
      startTime: new Date(Date.now() - 2 * DAY),
      endTime: new Date(Date.now() - 2 * DAY + 5400_000),
      duration: 5400,
    });

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const response = await app.request(`/api/cycle/${cycle.id}/report`);
    expect(response.status).toBe(200);

    const report = (await response.json()) as Report;

    expect(report.summary.totalTasks).toBe(3);
    expect(report.summary.doneTasks).toBe(2);
    expect(report.summary.estimateSeconds).toBe(14_400);
    expect(report.summary.doneEstimateSeconds).toBe(7200);
    expect(report.summary.loggedSeconds).toBe(5400);

    // La serie cubre el ciclo entero y la linea ideal baja a cero.
    expect(report.burndown.length).toBeGreaterThanOrEqual(6);
    expect(report.burndown[0].idealTasks).toBe(3);
    expect(report.burndown[report.burndown.length - 1].idealTasks).toBe(0);

    // Los dias futuros no se miden: la linea real tiene que parar hoy.
    const measured = report.burndown.filter((d) => d.remainingTasks !== null);
    const unmeasured = report.burndown.filter((d) => d.remainingTasks === null);
    expect(measured.length).toBeGreaterThan(0);
    expect(unmeasured.length).toBeGreaterThan(0);

    expect(report.hoursByPerson).toHaveLength(1);
    expect(report.hoursByPerson[0]).toMatchObject({
      userId: member.user.id,
      seconds: 5400,
    });
  });

  it("lists cycles with their counts and reports velocity history", async () => {
    const member = await createWorkspaceMember({ role: "admin" });
    const { project, columns } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });
    const cycle = await createCycleRow({
      projectId: project.id,
      name: "Sprint 1",
      status: "active",
    });
    await createTask({
      projectId: project.id,
      title: "Hecha",
      status: columns.done.slug,
      cycleId: cycle.id,
      estimate: 3600,
    });
    await createTask({
      projectId: project.id,
      title: "Pendiente",
      cycleId: cycle.id,
      estimate: 1800,
    });

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const list = (await (
      await app.request(`/api/cycle/project/${project.id}`)
    ).json()) as Cycle[];

    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      name: "Sprint 1",
      taskCount: 2,
      doneTaskCount: 1,
    });
    expect(Number(list[0].estimateSeconds)).toBe(5400);
    expect(Number(list[0].doneEstimateSeconds)).toBe(3600);

    // Antes de cerrar no hay historia de velocidad.
    const before = await (
      await app.request(`/api/cycle/project/${project.id}/velocity`)
    ).json();
    expect(before).toEqual([]);

    await app.request(`/api/cycle/${cycle.id}/close`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ unfinished: "backlog" }),
    });

    const after = (await (
      await app.request(`/api/cycle/project/${project.id}/velocity`)
    ).json()) as Array<{ doneTasks: number; doneEstimateSeconds: number }>;

    expect(after).toHaveLength(1);
    expect(after[0].doneTasks).toBe(1);
    expect(after[0].doneEstimateSeconds).toBe(3600);
  });

  it("refuses a plain member and anyone outside the workspace", async () => {
    const owner = await createWorkspaceMember({ role: "admin" });
    const plain = await createWorkspaceMember({ role: "member" });
    const { project } = await createProjectFixture({
      workspaceId: owner.workspace.id,
    });

    // `member` tiene `project: [create, read]`, no `update`: el mismo hallazgo
    // heredado que la Fase 3 documento con los campos personalizados.
    mockAuthenticatedSession(plain.user);
    const asPlain = createApp();
    const refused = await asPlain.app.request(
      `/api/cycle/project/${project.id}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "Sprint",
          startDate: new Date().toISOString(),
          endDate: new Date(Date.now() + DAY).toISOString(),
        }),
      },
    );
    expect(refused.status).toBe(403);

    const stranger = await createWorkspaceMember({ role: "admin" });
    mockAuthenticatedSession(stranger.user);
    const asStranger = createApp();
    const outside = await asStranger.app.request(
      `/api/cycle/project/${project.id}`,
    );
    expect(outside.status).toBe(403);
  });

  it("rejects an end date before the start date", async () => {
    const member = await createWorkspaceMember({ role: "admin" });
    const { project } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const response = await app.request(`/api/cycle/project/${project.id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Al reves",
        startDate: new Date(Date.now() + DAY).toISOString(),
        endDate: new Date().toISOString(),
      }),
    });

    expect(response.status).toBe(400);
  });
});
