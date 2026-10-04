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

async function addMemberToWorkspace(workspaceId: string, role: string) {
  const userId = `user-${randomUUID()}`;

  const [user] = await db
    .insert(schema.userTable)
    .values({
      id: userId,
      email: `${userId}@example.com`,
      emailVerified: true,
      name: "Otro miembro",
    })
    .returning();

  if (!user) throw new Error("Failed to seed user");

  await db.insert(schema.workspaceUserTable).values({
    workspaceId,
    userId: user.id,
    role,
    joinedAt: new Date(),
  });

  return user;
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

function createProjectField(
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

function createWorkspaceField(
  app: ReturnType<typeof createApp>["app"],
  workspaceId: string,
  body: Record<string, unknown>,
) {
  return app.request(`/api/field/workspace/${workspaceId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("field definition routes", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  it("creates a project field and derives a stable key from the name", async () => {
    const { app, projectId } = await setup();

    const response = await createProjectField(app, projectId, {
      name: "Número de expediente",
      type: "text",
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.key).toBe("numero_de_expediente");
    expect(body.name).toBe("Número de expediente");
    expect(body.projectId).toBe(projectId);
  });

  it("validates the configuration against the type", async () => {
    const { app, projectId } = await setup();

    const response = await createProjectField(app, projectId, {
      name: "Fase",
      type: "select",
      config: { options: [] },
    });

    expect(response.status).toBe(400);
  });

  it("answers 409 instead of leaking a constraint violation", async () => {
    const { app, projectId } = await setup();

    await createProjectField(app, projectId, {
      name: "Presupuesto",
      type: "currency",
      config: { currency: "EUR" },
    });
    const second = await createProjectField(app, projectId, {
      name: "Presupuesto",
      type: "text",
    });

    expect(second.status).toBe(409);
  });

  it("lists a project's own fields together with the workspace ones", async () => {
    const { app, projectId, workspaceId } = await setup();

    await createProjectField(app, projectId, {
      name: "Del proyecto",
      type: "text",
    });
    await createWorkspaceField(app, workspaceId, {
      name: "Del espacio",
      type: "text",
    });

    const response = await app.request(`/api/field/project/${projectId}`);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.map((row: { key: string }) => row.key).sort()).toEqual([
      "del_espacio",
      "del_proyecto",
    ]);
  });

  // La regla de desempate, que la base no puede aplicar porque sus indices
  // unicos son por alcance.
  it("lets the project's definition win over the workspace one", async () => {
    const { app, projectId, workspaceId } = await setup();

    await createWorkspaceField(app, workspaceId, {
      name: "Cliente",
      type: "text",
    });
    await createProjectField(app, projectId, { name: "Cliente", type: "url" });

    const response = await app.request(`/api/field/project/${projectId}`);
    const body = await response.json();

    expect(body).toHaveLength(1);
    expect(body[0].type).toBe("url");
    expect(body[0].projectId).toBe(projectId);
  });

  it("hides archived definitions unless they are asked for", async () => {
    const { app, projectId } = await setup();

    const created = await (
      await createProjectField(app, projectId, { name: "Viejo", type: "text" })
    ).json();

    await app.request(`/api/field/${created.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archived: true }),
    });

    const hidden = await (
      await app.request(`/api/field/project/${projectId}`)
    ).json();
    expect(hidden).toHaveLength(0);

    const shown = await (
      await app.request(`/api/field/project/${projectId}?includeArchived=true`)
    ).json();
    expect(shown).toHaveLength(1);
  });

  it("renames a field without touching the key its values are stored under", async () => {
    const { app, projectId } = await setup();

    const created = await (
      await createProjectField(app, projectId, {
        name: "Presupuesto",
        type: "number",
      })
    ).json();

    const response = await app.request(`/api/field/${created.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Presupuesto 2026" }),
    });

    const body = await response.json();
    expect(body.name).toBe("Presupuesto 2026");
    expect(body.key).toBe("presupuesto");
  });

  // El motivo de que borrar sea distinto de archivar.
  it("deleting a field also strips its value from the tasks", async () => {
    const { app, projectId, columnId } = await setup();

    const created = await (
      await createProjectField(app, projectId, {
        name: "Cliente",
        type: "text",
      })
    ).json();

    const task = await insertTask(projectId, columnId, {
      cliente: "BAUHAUS",
      otro: "se queda",
    });

    const response = await app.request(`/api/field/${created.id}`, {
      method: "DELETE",
    });
    expect(response.status).toBe(200);

    const stored = await db.query.taskTable.findFirst({
      where: eq(schema.taskTable.id, task.id),
    });

    expect(stored?.customFields).toEqual({ otro: "se queda" });
  });

  it("archiving a field keeps every value the tasks had", async () => {
    const { app, projectId, columnId } = await setup();

    const created = await (
      await createProjectField(app, projectId, {
        name: "Cliente",
        type: "text",
      })
    ).json();

    const task = await insertTask(projectId, columnId, { cliente: "BAUHAUS" });

    await app.request(`/api/field/${created.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archived: true }),
    });

    const stored = await db.query.taskTable.findFirst({
      where: eq(schema.taskTable.id, task.id),
    });

    expect(stored?.customFields).toEqual({ cliente: "BAUHAUS" });
  });

  it("strips a workspace field from tasks across every project", async () => {
    const { app, workspaceId, projectId, columnId } = await setup();
    const other = await createProjectFixture({ workspaceId });

    const created = await (
      await createWorkspaceField(app, workspaceId, {
        name: "Cliente",
        type: "text",
      })
    ).json();

    const here = await insertTask(projectId, columnId, { cliente: "BAUHAUS" });
    const there = await insertTask(other.project.id, other.columns.todo.id, {
      cliente: "LEROY",
    });

    await app.request(`/api/field/${created.id}`, { method: "DELETE" });

    for (const id of [here.id, there.id]) {
      const stored = await db.query.taskTable.findFirst({
        where: eq(schema.taskTable.id, id),
      });
      expect(stored?.customFields).toEqual({});
    }
  });

  // En un proyecto que declara la misma clave gana su campo (ADR 013), asi que
  // el valor de sus tareas es de ese campo y no del de espacio que se borra.
  it("keeps the values of a project field that shadows the deleted workspace one", async () => {
    const { app, workspaceId, projectId, columnId } = await setup();
    const other = await createProjectFixture({ workspaceId });

    const workspaceField = await (
      await createWorkspaceField(app, workspaceId, {
        name: "Cliente",
        type: "text",
      })
    ).json();
    await createProjectField(app, projectId, { name: "Cliente", type: "url" });

    const shadowed = await insertTask(projectId, columnId, {
      cliente: "https://bauhaus.es",
    });
    const plain = await insertTask(other.project.id, other.columns.todo.id, {
      cliente: "LEROY",
    });

    await app.request(`/api/field/${workspaceField.id}`, { method: "DELETE" });

    const read = async (id: string) =>
      (
        await db.query.taskTable.findFirst({
          where: eq(schema.taskTable.id, id),
        })
      )?.customFields;

    expect(await read(shadowed.id)).toEqual({ cliente: "https://bauhaus.es" });
    expect(await read(plain.id)).toEqual({});
  });
});

// El reparto que se decidio para esta fase: definir un campo de proyecto es
// `project:update`, y uno de espacio `workspace:manage_settings`. Un `member`
// tiene el primero pero no el segundo, asi que es el rol que distingue los dos
// casos.
describe("field definition permissions", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  // Hallazgo, no decision: el rol `member` heredado de Kaneo tiene
  // `project: ["create", "read"]` y NO `update`, asi que definir campos queda
  // hoy en manos de `admin` y `owner` incluso dentro de un proyecto. Es una
  // decision (ADR 062): `member` si asigna tareas, pero definir campos cambia
  // la estructura del proyecto. Rellenar el valor de un campo si esta al
  // alcance de un miembro, porque eso es `task:update`, que si tiene.
  it("stops a member from defining a project field, because project:update is admin-only", async () => {
    const { app, projectId } = await setup("member");

    const response = await createProjectField(app, projectId, {
      name: "Cliente",
      type: "text",
    });

    expect(response.status).toBe(403);
  });

  it("stops a member from defining a workspace-wide field", async () => {
    const { app, workspaceId } = await setup("member");

    const response = await createWorkspaceField(app, workspaceId, {
      name: "Cliente",
      type: "text",
    });

    expect(response.status).toBe(403);
  });

  it("stops a viewer from defining anything", async () => {
    const { app, projectId } = await setup("viewer");

    const response = await createProjectField(app, projectId, {
      name: "Cliente",
      type: "text",
    });

    expect(response.status).toBe(403);
  });

  // Lo que el precedente de las epicas no cubria: en PATCH y DELETE el
  // alcance no esta en la URL, asi que el permiso sale de la propia fila.
  // Ningun rol integrado separa los dos permisos —`admin` tiene los dos y
  // `member` ninguno—, asi que la unica forma de comprobar que el middleware
  // mira la fila y no la ruta es con un rol personalizado, que es
  // precisamente para lo que `workspace_role` es editable.
  it("picks the permission from the row on PATCH, not from the route", async () => {
    const admin = await createWorkspaceMember({ role: "admin" });
    const fixture = await createProjectFixture({
      workspaceId: admin.workspace.id,
    });

    mockAuthenticatedSession(admin.user);
    const adminApp = createApp().app;

    const workspaceField = await (
      await createWorkspaceField(adminApp, admin.workspace.id, {
        name: "Del espacio",
        type: "text",
      })
    ).json();
    const projectField = await (
      await createProjectField(adminApp, fixture.project.id, {
        name: "Del proyecto",
        type: "text",
      })
    ).json();

    await db.insert(schema.workspaceRoleTable).values({
      workspaceId: admin.workspace.id,
      role: "jefe_de_proyecto",
      permission: JSON.stringify({
        project: ["read", "update"],
        task: ["read", "update"],
        workspace: ["read"],
      }),
    });

    const lead = await addMemberToWorkspace(
      admin.workspace.id,
      "jefe_de_proyecto",
    );
    mockAuthenticatedSession(lead);
    const leadApp = createApp().app;

    const onProject = await leadApp.request(`/api/field/${projectField.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Renombrado" }),
    });
    expect(onProject.status).toBe(200);

    const onWorkspace = await leadApp.request(
      `/api/field/${workspaceField.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Renombrado" }),
      },
    );
    expect(onWorkspace.status).toBe(403);
  });
});

describe("workspace field list: filterable", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  type Listed = { key: string; filterable: boolean };

  async function listWorkspace(
    app: ReturnType<typeof createApp>["app"],
    workspaceId: string,
  ) {
    const response = await app.request(`/api/field/workspace/${workspaceId}`);
    expect(response.status).toBe(200);
    return new Map(
      ((await response.json()) as Listed[]).map((field) => [
        field.key,
        field.filterable,
      ]),
    );
  }

  it("marks a field a view across projects can filter by", async () => {
    const { app, workspaceId } = await setup();
    await createWorkspaceField(app, workspaceId, {
      name: "Presupuesto",
      type: "currency",
      config: { currency: "EUR" },
    });
    await createWorkspaceField(app, workspaceId, {
      name: "Expediente",
      type: "relation",
    });

    const fields = await listWorkspace(app, workspaceId);

    expect(fields.get("presupuesto")).toBe(true);
    // Una relacion vive fuera del JSONB y el motor no la incluye.
    expect(fields.get("expediente")).toBe(false);
  });

  // Ofrecerlo en la interfaz acabaria en un 400 del servidor, que lo retira.
  it("marks as not filterable a field a project redefines with another comparison", async () => {
    const { app, workspaceId, projectId } = await setup();
    await createWorkspaceField(app, workspaceId, {
      name: "Monto",
      type: "number",
    });
    await createWorkspaceField(app, workspaceId, {
      name: "Zona",
      type: "text",
    });
    // Mismo "monto", otra forma de comparar: texto en vez de numero.
    await createProjectField(app, projectId, { name: "Monto", type: "text" });
    // Misma forma de comparar (numero y moneda): no estorba.
    await createProjectField(app, projectId, { name: "Zona", type: "text" });

    const fields = await listWorkspace(app, workspaceId);

    expect(fields.get("monto")).toBe(false);
    expect(fields.get("zona")).toBe(true);
  });
});
