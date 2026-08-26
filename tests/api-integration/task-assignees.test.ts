import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { mockAnonymousSession, mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";

async function addWorkspaceMember(workspaceId: string, name: string) {
  const userId = `user-${randomUUID()}`;

  const [user] = await db
    .insert(schema.userTable)
    .values({
      id: userId,
      email: `${userId}@example.com`,
      emailVerified: true,
      name,
    })
    .returning();

  await db.insert(schema.workspaceUserTable).values({
    workspaceId,
    userId: user.id,
    role: "member",
    joinedAt: new Date(),
  });

  return user;
}

async function createTask(projectId: string, columnId: string) {
  const [task] = await db
    .insert(schema.taskTable)
    .values({
      projectId,
      title: "Trabajo a varias manos",
      status: "to-do",
      columnId,
      priority: "medium",
      number: 1,
      position: 0,
    })
    .returning();

  return task;
}

async function readAssignees(taskId: string) {
  const rows = await db
    .select({ userId: schema.taskAssigneeTable.userId })
    .from(schema.taskAssigneeTable)
    .where(eq(schema.taskAssigneeTable.taskId, taskId))
    .orderBy(schema.taskAssigneeTable.createdAt);

  return rows.map((row) => row.userId);
}

async function readPrimaryAssignee(taskId: string) {
  const [task] = await db
    .select({ userId: schema.taskTable.userId })
    .from(schema.taskTable)
    .where(eq(schema.taskTable.id, taskId));

  return task?.userId ?? null;
}

describe("API integration: multiple task assignees", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  // Asignar exige `task:assign`, que en los roles heredados solo tienen
  // `admin` y `owner`: un miembro puede crear y editar tareas, pero no
  // repartirlas. Por eso los casos que esperan un 200 usan `admin`.
  it("refuses a plain member, who has no assign permission", async () => {
    const member = await createWorkspaceMember({ role: "member" });
    const { project, columns } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });
    const task = await createTask(project.id, columns.todo.id);

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const response = await app.request(`/api/task/assignees/${task.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userIds: [member.user.id] }),
    });

    expect(response.status).toBe(403);
    await expect(readAssignees(task.id)).resolves.toEqual([]);
  });

  it("rejects unauthenticated assignee replacement", async () => {
    const member = await createWorkspaceMember({ role: "admin" });
    const { project, columns } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });
    const task = await createTask(project.id, columns.todo.id);

    mockAnonymousSession();
    const { app } = createApp();

    const response = await app.request(`/api/task/assignees/${task.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userIds: [member.user.id] }),
    });

    expect(response.status).toBe(401);
    await expect(readAssignees(task.id)).resolves.toEqual([]);
  });

  // El contrato de la fase: `task.assignee_id` sigue siendo el responsable
  // principal y es el primero de la lista, para que todo lo heredado que lo
  // lee siga leyendo algo cierto.
  it("stores the full set and keeps the first one as primary assignee", async () => {
    const member = await createWorkspaceMember({ role: "admin" });
    const second = await addWorkspaceMember(member.workspace.id, "Segunda");
    const third = await addWorkspaceMember(member.workspace.id, "Tercero");
    const { project, columns } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });
    const task = await createTask(project.id, columns.todo.id);

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const response = await app.request(`/api/task/assignees/${task.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        userIds: [member.user.id, second.id, third.id],
      }),
    });

    expect(response.status).toBe(200);

    const payload = (await response.json()) as { assigneeIds: string[] };
    // Se compara como conjunto: las tres filas entran en la misma sentencia y
    // `now()` es el de la transaccion, asi que comparten `created_at` y su
    // orden relativo no esta garantizado. Lo que si esta definido es quien
    // queda de responsable principal.
    expect([...payload.assigneeIds].sort()).toEqual(
      [member.user.id, second.id, third.id].sort(),
    );

    await expect(
      readAssignees(task.id).then((ids) => ids.sort()),
    ).resolves.toEqual([member.user.id, second.id, third.id].sort());
    await expect(readPrimaryAssignee(task.id)).resolves.toBe(member.user.id);
  });

  it("drops duplicates and blank ids instead of failing on the unique index", async () => {
    const member = await createWorkspaceMember({ role: "admin" });
    const { project, columns } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });
    const task = await createTask(project.id, columns.todo.id);

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const response = await app.request(`/api/task/assignees/${task.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        userIds: [member.user.id, member.user.id, "   "],
      }),
    });

    expect(response.status).toBe(200);
    await expect(readAssignees(task.id)).resolves.toEqual([member.user.id]);
  });

  it("keeps the assignment order of the people who stay", async () => {
    const member = await createWorkspaceMember({ role: "admin" });
    const second = await addWorkspaceMember(member.workspace.id, "Segunda");
    const { project, columns } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });
    const task = await createTask(project.id, columns.todo.id);

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    await app.request(`/api/task/assignees/${task.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userIds: [member.user.id, second.id] }),
    });

    const [firstRow] = await db
      .select({ createdAt: schema.taskAssigneeTable.createdAt })
      .from(schema.taskAssigneeTable)
      .where(eq(schema.taskAssigneeTable.userId, member.user.id));

    const response = await app.request(`/api/task/assignees/${task.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userIds: [member.user.id] }),
    });

    expect(response.status).toBe(200);
    await expect(readAssignees(task.id)).resolves.toEqual([member.user.id]);

    const [keptRow] = await db
      .select({ createdAt: schema.taskAssigneeTable.createdAt })
      .from(schema.taskAssigneeTable)
      .where(eq(schema.taskAssigneeTable.userId, member.user.id));

    expect(keptRow.createdAt.getTime()).toBe(firstRow.createdAt.getTime());
  });

  it("clears the set and the primary assignee with an empty list", async () => {
    const member = await createWorkspaceMember({ role: "admin" });
    const second = await addWorkspaceMember(member.workspace.id, "Segunda");
    const { project, columns } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });
    const task = await createTask(project.id, columns.todo.id);

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    await app.request(`/api/task/assignees/${task.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userIds: [member.user.id, second.id] }),
    });

    const response = await app.request(`/api/task/assignees/${task.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userIds: [] }),
    });

    expect(response.status).toBe(200);
    await expect(readAssignees(task.id)).resolves.toEqual([]);
    await expect(readPrimaryAssignee(task.id)).resolves.toBeNull();
  });

  it("refuses the whole list when one of them is not a workspace member", async () => {
    const member = await createWorkspaceMember({ role: "admin" });
    const stranger = await createWorkspaceMember({ role: "admin" });
    const { project, columns } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });
    const task = await createTask(project.id, columns.todo.id);

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const response = await app.request(`/api/task/assignees/${task.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        userIds: [member.user.id, stranger.user.id],
      }),
    });

    expect(response.status).toBe(403);
    await expect(readAssignees(task.id)).resolves.toEqual([]);
    await expect(readPrimaryAssignee(task.id)).resolves.toBeNull();
  });

  // Las dos vias de asignacion escriben la misma tabla: la heredada de un solo
  // responsable no puede dejar el conjunto desfasado.
  it("keeps the set in sync when the legacy single-assignee route writes", async () => {
    const member = await createWorkspaceMember({ role: "admin" });
    const second = await addWorkspaceMember(member.workspace.id, "Segunda");
    const { project, columns } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });
    const task = await createTask(project.id, columns.todo.id);

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const assigned = await app.request(`/api/task/assignee/${task.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId: member.user.id }),
    });

    expect(assigned.status).toBe(200);
    await expect(readAssignees(task.id)).resolves.toEqual([member.user.id]);

    const reassigned = await app.request(`/api/task/assignee/${task.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId: second.id }),
    });

    expect(reassigned.status).toBe(200);
    await expect(readAssignees(task.id)).resolves.toEqual([second.id]);
    await expect(readPrimaryAssignee(task.id)).resolves.toBe(second.id);
  });

  it("refuses a member of another workspace", async () => {
    const member = await createWorkspaceMember({ role: "admin" });
    const stranger = await createWorkspaceMember({ role: "admin" });
    const { project, columns } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });
    const task = await createTask(project.id, columns.todo.id);

    mockAuthenticatedSession(stranger.user);
    const { app } = createApp();

    const response = await app.request(`/api/task/assignees/${task.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userIds: [stranger.user.id] }),
    });

    expect(response.status).toBe(403);
    await expect(readAssignees(task.id)).resolves.toEqual([]);
  });
});
