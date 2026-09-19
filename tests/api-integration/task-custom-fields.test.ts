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

let taskNumber = 0;

async function setup(role = "admin") {
  const member = await createWorkspaceMember({ role });
  const fixture = await createProjectFixture({
    workspaceId: member.workspace.id,
  });
  mockAuthenticatedSession(member.user);

  return {
    app: createApp().app,
    workspaceId: member.workspace.id,
    projectId: fixture.project.id,
    columnId: fixture.columns.todo.id,
    user: member.user,
  };
}

async function insertTask(
  projectId: string,
  columnId: string,
  customFields: Record<string, unknown> = {},
) {
  taskNumber += 1;

  const [task] = await db
    .insert(schema.taskTable)
    .values({
      ...taskTreeValues(),
      projectId,
      columnId,
      title: `Tarea ${taskNumber}`,
      status: "to-do",
      priority: "medium",
      number: taskNumber,
      position: taskNumber,
      customFields,
    })
    .returning();

  if (!task) throw new Error("Failed to seed task");
  return task;
}

function defineField(
  app: ReturnType<typeof createApp>["app"],
  projectId: string,
  body: Record<string, unknown>,
) {
  return app.request(`/api/field/project/${projectId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function setValues(
  app: ReturnType<typeof createApp>["app"],
  taskId: string,
  values: Record<string, unknown>,
) {
  return app.request(`/api/task/custom-fields/${taskId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ values }),
  });
}

describe("task custom field values", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  it("stores a value and hands it back when the task is read", async () => {
    const { app, projectId, columnId } = await setup();

    await defineField(app, projectId, {
      name: "Presupuesto",
      type: "currency",
      config: { currency: "EUR" },
    });
    const task = await insertTask(projectId, columnId);

    const written = await setValues(app, task.id, { presupuesto: 1250.5 });
    expect(written.status).toBe(200);

    const read = await app.request(`/api/task/${task.id}`);
    const body = await read.json();

    expect(body.customFields).toEqual({ presupuesto: 1250.5 });
  });

  it("rejects a value that does not match its definition", async () => {
    const { app, projectId, columnId } = await setup();

    await defineField(app, projectId, { name: "Presupuesto", type: "number" });
    const task = await insertTask(projectId, columnId);

    const response = await setValues(app, task.id, {
      presupuesto: "un montón",
    });

    expect(response.status).toBe(400);
    expect(await response.text()).toContain("Presupuesto");
  });

  it("rejects a key with no definition behind it", async () => {
    const { app, projectId, columnId } = await setup();
    const task = await insertTask(projectId, columnId);

    const response = await setValues(app, task.id, { inventado: "x" });

    expect(response.status).toBe(400);
  });

  // La escritura es parcial: mandar un campo no puede borrar los demas.
  it("touches only the keys the request carries", async () => {
    const { app, projectId, columnId } = await setup();

    await defineField(app, projectId, { name: "Cliente", type: "text" });
    await defineField(app, projectId, { name: "Nota", type: "text" });

    const task = await insertTask(projectId, columnId);
    await setValues(app, task.id, { cliente: "BAUHAUS", nota: "primera" });
    await setValues(app, task.id, { nota: "segunda" });

    const stored = await db.query.taskTable.findFirst({
      where: eq(schema.taskTable.id, task.id),
    });

    expect(stored?.customFields).toEqual({
      cliente: "BAUHAUS",
      nota: "segunda",
    });
  });

  it("clears a value instead of storing null", async () => {
    const { app, projectId, columnId } = await setup();

    await defineField(app, projectId, { name: "Cliente", type: "text" });
    const task = await insertTask(projectId, columnId, { cliente: "BAUHAUS" });

    await setValues(app, task.id, { cliente: null });

    const stored = await db.query.taskTable.findFirst({
      where: eq(schema.taskTable.id, task.id),
    });

    expect(stored?.customFields).toEqual({});
  });

  it("refuses to clear a required field", async () => {
    const { app, projectId, columnId } = await setup();

    await defineField(app, projectId, {
      name: "Cliente",
      type: "text",
      required: true,
    });
    const task = await insertTask(projectId, columnId, { cliente: "BAUHAUS" });

    const response = await setValues(app, task.id, { cliente: "" });

    expect(response.status).toBe(400);
  });

  it("accepts a workspace-wide field on a task of any project", async () => {
    const { app, workspaceId, projectId, columnId } = await setup();

    await app.request(`/api/field/workspace/${workspaceId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Cliente", type: "text" }),
    });

    const task = await insertTask(projectId, columnId);
    const response = await setValues(app, task.id, { cliente: "BAUHAUS" });

    expect(response.status).toBe(200);
  });

  // Un campo "usuario" no puede ser una puerta trasera para apuntar a alguien
  // de fuera del espacio de trabajo.
  it("refuses a user value from outside the workspace", async () => {
    const { app, projectId, columnId } = await setup();
    const outsider = await createWorkspaceMember({ role: "admin" });

    await defineField(app, projectId, { name: "Revisor", type: "user" });
    const task = await insertTask(projectId, columnId);

    const response = await setValues(app, task.id, {
      revisor: outsider.user.id,
    });

    expect(response.status).not.toBe(200);
  });

  it("accepts a user value from inside the workspace", async () => {
    const { app, projectId, columnId, user } = await setup();

    await defineField(app, projectId, { name: "Revisor", type: "user" });
    const task = await insertTask(projectId, columnId);

    const response = await setValues(app, task.id, { revisor: user.id });

    expect(response.status).toBe(200);
  });

  // Rellenar un valor es editar la tarea, no administrar el proyecto: por eso
  // un miembro puede hacerlo aunque no pueda definir el campo.
  it("lets a member fill a value even though it cannot define the field", async () => {
    const admin = await createWorkspaceMember({ role: "admin" });
    const fixture = await createProjectFixture({
      workspaceId: admin.workspace.id,
    });

    mockAuthenticatedSession(admin.user);
    const adminApp = createApp().app;
    await defineField(adminApp, fixture.project.id, {
      name: "Cliente",
      type: "text",
    });

    const task = await insertTask(fixture.project.id, fixture.columns.todo.id);

    const memberUserId = `user-${randomUUID()}`;
    const [memberUser] = await db
      .insert(schema.userTable)
      .values({
        id: memberUserId,
        email: `${memberUserId}@example.com`,
        emailVerified: true,
        name: "Miembro",
      })
      .returning();

    if (!memberUser) throw new Error("Failed to seed user");

    await db.insert(schema.workspaceUserTable).values({
      workspaceId: admin.workspace.id,
      userId: memberUser.id,
      role: "member",
      joinedAt: new Date(),
    });

    mockAuthenticatedSession(memberUser);
    const memberApp = createApp().app;

    const response = await setValues(memberApp, task.id, {
      cliente: "BAUHAUS",
    });

    expect(response.status).toBe(200);
  });
});
