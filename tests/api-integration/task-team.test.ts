import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { mockAnonymousSession, mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
  taskTreeValues,
} from "./helpers/fixtures";

async function createTeam(workspaceId: string, name = "Desarrollo") {
  const [team] = await db
    .insert(schema.teamTable)
    .values({
      id: `team-${randomUUID()}`,
      workspaceId,
      name,
      createdAt: new Date(),
    })
    .returning();

  return team;
}

async function createTask(projectId: string, columnId: string) {
  const [task] = await db
    .insert(schema.taskTable)
    .values({
      ...taskTreeValues(),
      projectId,
      title: "Reparto por departamento",
      status: "to-do",
      columnId,
      priority: "medium",
      number: 1,
      position: 0,
    })
    .returning();

  return task;
}

describe("API integration: task team assignment", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  // Repartir trabajo entre departamentos exige `task:assign`. Lo tienen
  // `member`, `admin` y `owner`; `viewer` no.
  it("refuses a viewer, who has no assign permission", async () => {
    const member = await createWorkspaceMember({ role: "viewer" });
    const { project, columns } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });
    const team = await createTeam(member.workspace.id);
    const task = await createTask(project.id, columns.todo.id);

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const response = await app.request(`/api/task/team/${task.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ teamId: team.id }),
    });

    expect(response.status).toBe(403);

    const [stored] = await db
      .select({ teamId: schema.taskTable.teamId })
      .from(schema.taskTable)
      .where(eq(schema.taskTable.id, task.id));

    expect(stored.teamId).toBeNull();
  });

  it("lets a plain member assign a task to a team", async () => {
    const member = await createWorkspaceMember({ role: "member" });
    const { project, columns } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });
    const team = await createTeam(member.workspace.id);
    const task = await createTask(project.id, columns.todo.id);

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const response = await app.request(`/api/task/team/${task.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ teamId: team.id }),
    });

    expect(response.status).toBe(200);

    const [stored] = await db
      .select({ teamId: schema.taskTable.teamId })
      .from(schema.taskTable)
      .where(eq(schema.taskTable.id, task.id));

    expect(stored.teamId).toBe(team.id);
  });

  it("rejects unauthenticated team assignment", async () => {
    const member = await createWorkspaceMember({ role: "admin" });
    const { project, columns } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });
    const team = await createTeam(member.workspace.id);
    const task = await createTask(project.id, columns.todo.id);

    mockAnonymousSession();
    const { app } = createApp();

    const response = await app.request(`/api/task/team/${task.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ teamId: team.id }),
    });

    expect(response.status).toBe(401);

    const [stored] = await db
      .select({ teamId: schema.taskTable.teamId })
      .from(schema.taskTable)
      .where(eq(schema.taskTable.id, task.id));

    expect(stored.teamId).toBeNull();
  });

  it("assigns a team of the same workspace and records the change", async () => {
    const member = await createWorkspaceMember({ role: "admin" });
    const { project, columns } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });
    const team = await createTeam(member.workspace.id, "Diseño");
    const task = await createTask(project.id, columns.todo.id);

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const response = await app.request(`/api/task/team/${task.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ teamId: team.id }),
    });

    expect(response.status).toBe(200);

    const payload = (await response.json()) as { teamId: string | null };
    expect(payload.teamId).toBe(team.id);

    const [stored] = await db
      .select({ teamId: schema.taskTable.teamId })
      .from(schema.taskTable)
      .where(eq(schema.taskTable.id, task.id));

    expect(stored.teamId).toBe(team.id);

    // La actividad la escribe un suscriptor del evento, despues de responder.
    await vi.waitFor(async () => {
      const activity = await db
        .select({ type: schema.activityTable.type })
        .from(schema.activityTable)
        .where(eq(schema.activityTable.taskId, task.id));

      expect(activity.map((entry) => entry.type)).toContain("team_changed");
    });
  });

  it("unassigns the team when the body carries null", async () => {
    const member = await createWorkspaceMember({ role: "admin" });
    const { project, columns } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });
    const team = await createTeam(member.workspace.id);
    const task = await createTask(project.id, columns.todo.id);

    await db
      .update(schema.taskTable)
      .set({ teamId: team.id })
      .where(eq(schema.taskTable.id, task.id));

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const response = await app.request(`/api/task/team/${task.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ teamId: null }),
    });

    expect(response.status).toBe(200);

    const [stored] = await db
      .select({ teamId: schema.taskTable.teamId })
      .from(schema.taskTable)
      .where(eq(schema.taskTable.id, task.id));

    expect(stored.teamId).toBeNull();
  });

  it("treats a whitespace-only team as an unassignment", async () => {
    const member = await createWorkspaceMember({ role: "admin" });
    const { project, columns } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });
    const team = await createTeam(member.workspace.id);
    const task = await createTask(project.id, columns.todo.id);

    await db
      .update(schema.taskTable)
      .set({ teamId: team.id })
      .where(eq(schema.taskTable.id, task.id));

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const response = await app.request(`/api/task/team/${task.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ teamId: "   " }),
    });

    expect(response.status).toBe(200);

    const [stored] = await db
      .select({ teamId: schema.taskTable.teamId })
      .from(schema.taskTable)
      .where(eq(schema.taskTable.id, task.id));

    expect(stored.teamId).toBeNull();
  });

  // El equipo es el limite de reparto dentro de un espacio; si se pudiera
  // asignar uno de otro espacio, el filtro por equipo enseñaria tareas de un
  // departamento que no existe ahi.
  it("refuses a team that belongs to another workspace", async () => {
    const member = await createWorkspaceMember({ role: "admin" });
    const stranger = await createWorkspaceMember({ role: "admin" });
    const { project, columns } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });
    const foreignTeam = await createTeam(stranger.workspace.id, "Ajeno");
    const task = await createTask(project.id, columns.todo.id);

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const response = await app.request(`/api/task/team/${task.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ teamId: foreignTeam.id }),
    });

    expect(response.status).toBe(403);

    const [stored] = await db
      .select({ teamId: schema.taskTable.teamId })
      .from(schema.taskTable)
      .where(eq(schema.taskTable.id, task.id));

    expect(stored.teamId).toBeNull();
  });

  // Mismo 403 que el equipo ajeno, a proposito: distinguirlos diria que ese id
  // existe en algun sitio.
  it("answers a team that does not exist with the same refusal", async () => {
    const member = await createWorkspaceMember({ role: "admin" });
    const { project, columns } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });
    const task = await createTask(project.id, columns.todo.id);

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const response = await app.request(`/api/task/team/${task.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ teamId: `team-${randomUUID()}` }),
    });

    expect(response.status).toBe(403);
  });

  it("refuses a member of another workspace", async () => {
    const member = await createWorkspaceMember({ role: "admin" });
    const stranger = await createWorkspaceMember({ role: "admin" });
    const { project, columns } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });
    const team = await createTeam(member.workspace.id);
    const task = await createTask(project.id, columns.todo.id);

    mockAuthenticatedSession(stranger.user);
    const { app } = createApp();

    const response = await app.request(`/api/task/team/${task.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ teamId: team.id }),
    });

    expect(response.status).toBe(403);

    const [stored] = await db
      .select({ teamId: schema.taskTable.teamId })
      .from(schema.taskTable)
      .where(eq(schema.taskTable.id, task.id));

    expect(stored.teamId).toBeNull();
  });

  // La tarea inexistente ni siquiera llega al controlador: sin tarea no hay
  // espacio de trabajo contra el que autorizar, y la guarda corta antes.
  it("stops a task that does not exist at the workspace guard", async () => {
    const member = await createWorkspaceMember({ role: "admin" });
    await createProjectFixture({ workspaceId: member.workspace.id });

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const response = await app.request(`/api/task/team/${randomUUID()}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ teamId: null }),
    });

    expect(response.status).toBe(400);
  });
});
