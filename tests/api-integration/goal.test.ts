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

type Target = {
  id: string;
  name: string;
  targetValue: number;
  current: number | null;
  error?: string;
};

type Goal = {
  id: string;
  name: string;
  startsAt: string;
  endsAt: string;
  targets: Target[];
};

let taskCounter = 0;

/** Una tarea cerrada en una fecha concreta: el disparador respeta la que se le da. */
async function seedTask(
  projectId: string,
  assigneeId: string,
  completedAt: Date | null,
) {
  taskCounter += 1;

  const [task] = await db
    .insert(schema.taskTable)
    .values({
      ...taskTreeValues(),
      projectId,
      title: `Tarea ${taskCounter}`,
      status: completedAt ? "done" : "to-do",
      priority: "medium",
      number: taskCounter,
      position: taskCounter,
      userId: assigneeId,
      completedAt,
    })
    .returning();

  await db
    .insert(schema.taskAssigneeTable)
    .values({ taskId: task.id, userId: assigneeId });

  return task;
}

describe("API integration: goals", () => {
  beforeEach(async () => {
    await resetTestDatabase();
    taskCounter = 0;
  });

  async function setup() {
    const member = await createWorkspaceMember({ role: "member" });
    const { project } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const goal = (await (
      await app.request("/api/goal", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workspaceId: member.workspace.id,
          name: "Trimestre",
          startsAt: "2026-07-01",
          endsAt: "2026-10-01",
        }),
      })
    ).json()) as Goal;

    return { app, member, project, goal };
  }

  it("measures progress from closed tasks instead of storing it", async () => {
    const { app, member, project, goal } = await setup();

    await app.request(`/api/goal/${goal.id}/target`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Cerrar 10 tareas",
        targetValue: 10,
        config: { scope: "assigned", metric: "doneCount" },
      }),
    });

    // Dentro del periodo cuentan; fuera, no. Es lo que hace que el periodo sea
    // una medida y no una etiqueta.
    await seedTask(project.id, member.user.id, new Date("2026-08-15"));
    await seedTask(project.id, member.user.id, new Date("2026-09-01"));
    await seedTask(project.id, member.user.id, new Date("2026-06-01"));
    await seedTask(project.id, member.user.id, null);

    const goals = (await (
      await app.request(`/api/goal?workspaceId=${member.workspace.id}`)
    ).json()) as Goal[];

    expect(goals).toHaveLength(1);
    expect(goals[0].targets).toHaveLength(1);
    expect(goals[0].targets[0].current).toBe(2);
    expect(goals[0].targets[0].targetValue).toBe(10);

    // Y avanza al cerrar otra, sin tocar nada mas: el progreso se mide al leer.
    await seedTask(project.id, member.user.id, new Date("2026-09-20"));

    const after = (await (
      await app.request(`/api/goal?workspaceId=${member.workspace.id}`)
    ).json()) as Goal[];

    expect(after[0].targets[0].current).toBe(3);
  });

  it("carries a per-target error instead of failing the whole goal", async () => {
    const { app, member, goal } = await setup();

    await app.request(`/api/goal/${goal.id}/target`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Roto",
        targetValue: 5,
        config: {
          filter: [
            { id: "a", field: "custom.noexiste", operator: "eq", value: "x" },
          ],
        },
      }),
    });

    await app.request(`/api/goal/${goal.id}/target`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Sano", targetValue: 5, config: {} }),
    });

    const goals = (await (
      await app.request(`/api/goal?workspaceId=${member.workspace.id}`)
    ).json()) as Goal[];

    const broken = goals[0].targets.find((t) => t.name === "Roto");
    const healthy = goals[0].targets.find((t) => t.name === "Sano");

    expect(broken?.current).toBeNull();
    expect(broken?.error).toContain("noexiste");
    expect(healthy?.current).toBe(0);
  });

  it("refuses a goal that belongs to someone else", async () => {
    const { app, member, goal } = await setup();

    const [other] = await db
      .insert(schema.userTable)
      .values({
        id: `user-${Date.now()}`,
        email: "otra@example.com",
        emailVerified: true,
        name: "Otra",
      })
      .returning();

    await db.insert(schema.workspaceUserTable).values({
      workspaceId: member.workspace.id,
      userId: other.id,
      role: "member",
      joinedAt: new Date(),
    });

    mockAuthenticatedSession(other);
    const otherApp = createApp().app;

    const response = await otherApp.request(`/api/goal/${goal.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Secuestrado" }),
    });

    expect(response.status).toBe(403);

    // Y ni siquiera lo ve al listar: la propiedad es la puerta de lectura.
    const theirs = (await (
      await otherApp.request(`/api/goal?workspaceId=${member.workspace.id}`)
    ).json()) as Goal[];

    expect(theirs).toHaveLength(0);
    expect(app).toBeDefined();
  });

  it("rejects a period that ends before it starts", async () => {
    const member = await createWorkspaceMember({ role: "member" });
    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const response = await app.request("/api/goal", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        workspaceId: member.workspace.id,
        name: "Al reves",
        startsAt: "2026-10-01",
        endsAt: "2026-07-01",
      }),
    });

    // Lo veta la base con su CHECK, no el controlador: dos peticiones a la vez
    // se saltarian una comprobacion en la aplicacion.
    expect(response.status).toBeGreaterThanOrEqual(400);
  });
});
