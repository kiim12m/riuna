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
} from "./helpers/fixtures";

type App = ReturnType<typeof createApp>["app"];

async function addMember(workspaceId: string, role: string) {
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

function asUser(user: typeof schema.userTable.$inferSelect): App {
  mockAuthenticatedSession(user);
  return createApp().app;
}

function saveView(app: App, projectId: string, body: Record<string, unknown>) {
  return app.request(`/api/view/project/${projectId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function listViews(app: App, projectId: string, query = "") {
  return app.request(`/api/view/project/${projectId}${query}`);
}

function saveWorkspaceView(
  app: App,
  workspaceId: string,
  body: Record<string, unknown>,
) {
  return app.request(`/api/view/workspace?workspaceId=${workspaceId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function listWorkspaceViews(app: App, workspaceId: string, query = "") {
  return app.request(`/api/view/workspace?workspaceId=${workspaceId}${query}`);
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
    user: member.user,
  };
}

describe("saved views", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  it("saves a view with its filter inside the config", async () => {
    const { app, projectId } = await setup();

    // El `config` guarda lo que la barra de filtros tiene en pantalla: una
    // lista de condiciones en edicion, con su `id` de React. **No** es el
    // `FilterNode` que viaja en la URL, que es la forma ya compilada.
    //
    // Esta prueba guardaba un `FilterNode` y pasaba, porque hasta la Fase 4.5
    // el `config` era `v.record(v.string(), v.unknown())` y no se validaba
    // nada. Pero esa forma nunca funciono de punta a punta: `handleApplyView`
    // solo honra `config.filter` si es un array y descarta lo demas en
    // silencio, asi que una vista guardada asi se cargaba sin filtro.
    const config = {
      filter: [
        {
          id: "1",
          field: "custom.presupuesto",
          operator: "gt",
          value: 1000,
        },
      ],
      treeMode: "withDescendants",
    };

    const response = await saveView(app, projectId, {
      name: "Obras caras",
      type: "table",
      config,
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.name).toBe("Obras caras");
    expect(body.config).toEqual(config);
    expect(body.isShared).toBe(false);
  });

  // Que columnas se ven y por que se agrupa viajan con la vista (punto 32 del
  // cierre de la deuda): la vista Tabla de la Fase 4 solo recordaba el filtro.
  it("remembers the visible columns and the grouping", async () => {
    const { app, projectId } = await setup();
    const config = {
      columns: ["title", "status", "custom.presupuesto", "agg.progress"],
      groupBy: "epic",
    };

    const response = await saveView(app, projectId, {
      name: "Por epica",
      type: "table",
      config,
    });

    expect(response.status).toBe(200);
    expect((await response.json()).config).toEqual(config);
  });

  it("remembers the row colours", async () => {
    const { app, projectId } = await setup();
    const config = { color: "priority" };

    const response = await saveView(app, projectId, {
      name: "Por prioridad",
      type: "table",
      config,
    });

    expect((await response.json()).config).toEqual(config);
  });

  it("refuses a colouring the table does not offer", async () => {
    const { app, projectId } = await setup();

    const response = await saveView(app, projectId, {
      name: "Mal",
      type: "table",
      config: { color: "epic" },
    });

    expect(response.status).toBe(400);
  });

  it("refuses a grouping the table does not offer, or an absurd column list", async () => {
    const { app, projectId } = await setup();

    const byAssignee = await saveView(app, projectId, {
      name: "Mal",
      type: "table",
      config: { groupBy: "assignee" },
    });
    const tooMany = await saveView(app, projectId, {
      name: "Demasiadas",
      type: "table",
      config: { columns: Array.from({ length: 101 }, (_, i) => `c${i}`) },
    });

    expect(byAssignee.status).toBe(400);
    expect(tooMany.status).toBe(400);
  });

  // La mitad de la fase que sigue al alcance de todo el mundo: un `member` no
  // puede definir un campo, pero si guardarse una vista.
  it("lets a plain member save one", async () => {
    const { app, projectId } = await setup("member");

    const response = await saveView(app, projectId, {
      name: "La mia",
      type: "table",
    });

    expect(response.status).toBe(200);
  });

  it("keeps a private view out of everyone else's list", async () => {
    const owner = await createWorkspaceMember({ role: "member" });
    const fixture = await createProjectFixture({
      workspaceId: owner.workspace.id,
    });

    const ownerApp = asUser(owner.user);
    await saveView(ownerApp, fixture.project.id, {
      name: "Solo mia",
      type: "table",
    });

    const other = await addMember(owner.workspace.id, "member");
    const otherApp = asUser(other);
    const listed = await (await listViews(otherApp, fixture.project.id)).json();

    expect(listed).toHaveLength(0);
  });

  it("shows a shared view to the rest of the workspace", async () => {
    const owner = await createWorkspaceMember({ role: "member" });
    const fixture = await createProjectFixture({
      workspaceId: owner.workspace.id,
    });

    const ownerApp = asUser(owner.user);
    await saveView(ownerApp, fixture.project.id, {
      name: "De todos",
      type: "table",
      isShared: true,
    });

    const other = await addMember(owner.workspace.id, "member");
    const otherApp = asUser(other);
    const listed = await (await listViews(otherApp, fixture.project.id)).json();

    expect(listed.map((row: { name: string }) => row.name)).toEqual([
      "De todos",
    ]);
  });

  // La decision central: la vista es de quien la crea, no del rol.
  it("stops someone else from editing a shared view", async () => {
    const owner = await createWorkspaceMember({ role: "admin" });
    const fixture = await createProjectFixture({
      workspaceId: owner.workspace.id,
    });

    const ownerApp = asUser(owner.user);
    const saved = await (
      await saveView(ownerApp, fixture.project.id, {
        name: "De todos",
        type: "table",
        isShared: true,
      })
    ).json();

    const other = await addMember(owner.workspace.id, "member");
    const otherApp = asUser(other);

    const response = await otherApp.request(`/api/view/${saved.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Secuestrada" }),
    });

    expect(response.status).toBe(403);
  });

  it("lets the owner edit and share their own", async () => {
    const { app, projectId } = await setup();

    const saved = await (
      await saveView(app, projectId, { name: "Borrador", type: "table" })
    ).json();

    const response = await app.request(`/api/view/${saved.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Definitiva", isShared: true }),
    });

    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.name).toBe("Definitiva");
    expect(body.isShared).toBe(true);
  });

  // Un administrador puede retirar una vista compartida que estorbe.
  it("lets a workspace admin remove someone else's shared view", async () => {
    const owner = await createWorkspaceMember({ role: "member" });
    const fixture = await createProjectFixture({
      workspaceId: owner.workspace.id,
    });

    const ownerApp = asUser(owner.user);
    const saved = await (
      await saveView(ownerApp, fixture.project.id, {
        name: "Molesta",
        type: "table",
        isShared: true,
      })
    ).json();

    const admin = await addMember(owner.workspace.id, "admin");
    const adminApp = asUser(admin);

    const response = await adminApp.request(`/api/view/${saved.id}`, {
      method: "DELETE",
    });

    expect(response.status).toBe(200);
  });

  it("filters the list by the view's type", async () => {
    const { app, projectId } = await setup();

    await saveView(app, projectId, { name: "Tabla", type: "table" });
    await saveView(app, projectId, { name: "Tablero", type: "board" });

    const listed = await (
      await listViews(app, projectId, "?type=table")
    ).json();

    expect(listed.map((row: { name: string }) => row.name)).toEqual(["Tabla"]);
  });

  it("refuses a type outside the vocabulary", async () => {
    const { app, projectId } = await setup();

    const response = await saveView(app, projectId, {
      name: "Rara",
      type: "telepatia",
    });

    expect(response.status).toBe(400);
  });

  it("archives a view instead of listing it", async () => {
    const { app, projectId } = await setup();

    const saved = await (
      await saveView(app, projectId, { name: "Vieja", type: "table" })
    ).json();

    await app.request(`/api/view/${saved.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archived: true }),
    });

    const listed = await (await listViews(app, projectId)).json();
    expect(listed).toHaveLength(0);
  });

  it("drops a project's views with the project", async () => {
    const { app, projectId } = await setup();

    await saveView(app, projectId, { name: "Se va", type: "table" });

    await db
      .delete(schema.projectTable)
      .where(eq(schema.projectTable.id, projectId));

    const remaining = await db.select().from(schema.viewTable);
    expect(remaining).toHaveLength(0);
  });
});

// ADR 039 — "Mis tareas": las mismas reglas de propiedad y de compartir, pero
// `projectId` nulo en vez de un proyecto. `getViews`/`createView` ya sabian
// de esto desde que existen; lo nuevo es la ruta HTTP que llama sin uno.
describe("saved views scoped to the workspace", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  it("saves and lists a workspace-scoped view without a project", async () => {
    const { app, workspaceId } = await setup();

    const response = await saveWorkspaceView(app, workspaceId, {
      name: "Mis tareas de la semana",
      type: "list",
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.name).toBe("Mis tareas de la semana");
    expect(body.projectId).toBeNull();

    const listed = await (await listWorkspaceViews(app, workspaceId)).json();
    expect(listed.map((row: { name: string }) => row.name)).toEqual([
      "Mis tareas de la semana",
    ]);
  });

  // `getViews` ya mezclaba esto antes de este bloque: una vista de proyecto
  // no se cuela en el espacio, pero una de espacio si se ve dentro de
  // cualquier proyecto —es la misma regla que un campo personalizado de
  // espacio, visible en todos los proyectos que no lo eclipsan.
  it("shows a workspace view inside a project's list, not the other way around", async () => {
    const { app, projectId, workspaceId } = await setup();

    await saveView(app, projectId, { name: "De proyecto", type: "table" });
    await saveWorkspaceView(app, workspaceId, {
      name: "De espacio",
      type: "table",
    });

    const projectViews = await (await listViews(app, projectId)).json();
    const workspaceViews = await (
      await listWorkspaceViews(app, workspaceId)
    ).json();

    expect(
      projectViews.map((row: { name: string }) => row.name).sort(),
    ).toEqual(["De espacio", "De proyecto"]);
    expect(workspaceViews.map((row: { name: string }) => row.name)).toEqual([
      "De espacio",
    ]);
  });

  it("keeps a private workspace view out of everyone else's list", async () => {
    const owner = await createWorkspaceMember({ role: "member" });
    const ownerApp = asUser(owner.user);

    await saveWorkspaceView(ownerApp, owner.workspace.id, {
      name: "Solo mia",
      type: "list",
    });

    const other = await addMember(owner.workspace.id, "member");
    const otherApp = asUser(other);
    const listed = await (
      await listWorkspaceViews(otherApp, owner.workspace.id)
    ).json();

    expect(listed).toHaveLength(0);
  });

  it("shows a shared workspace view to the rest of the workspace", async () => {
    const owner = await createWorkspaceMember({ role: "member" });
    const ownerApp = asUser(owner.user);

    await saveWorkspaceView(ownerApp, owner.workspace.id, {
      name: "De todos",
      type: "board",
      isShared: true,
    });

    const other = await addMember(owner.workspace.id, "member");
    const otherApp = asUser(other);
    const listed = await (
      await listWorkspaceViews(otherApp, owner.workspace.id)
    ).json();

    expect(listed.map((row: { name: string }) => row.name)).toEqual([
      "De todos",
    ]);
  });

  // PATCH y DELETE no distinguen projectId: la misma ruta de siempre sirve.
  it("edits a workspace view through the same PATCH as a project view", async () => {
    const { app, workspaceId } = await setup();

    const saved = await (
      await saveWorkspaceView(app, workspaceId, {
        name: "Borrador",
        type: "table",
      })
    ).json();

    const response = await app.request(`/api/view/${saved.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Definitiva", isShared: true }),
    });

    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.name).toBe("Definitiva");
    expect(body.isShared).toBe(true);
  });

  it("someone outside the workspace cannot list its views", async () => {
    const { workspaceId } = await setup();
    const outsider = await createWorkspaceMember({ role: "member" });
    const outsiderApp = asUser(outsider.user);

    const response = await listWorkspaceViews(outsiderApp, workspaceId);

    expect(response.status).toBe(403);
  });
});
