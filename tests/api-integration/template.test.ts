import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import db, { schema } from "../../apps/api/src/database";
import { subscribeToEvent } from "../../apps/api/src/events";
import { createApp } from "../../apps/api/src/index";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import {
  childTreeValues,
  createProjectFixture,
  createWorkspaceMember,
  taskTreeValues,
} from "./helpers/fixtures";

type Template = {
  id: string;
  name: string;
  kind: string;
  taskCount: number;
};

let counter = 0;

const createdEvents: Array<{ taskId?: string }> = [];
let subscribed = false;

function recordCreatedEvents() {
  if (subscribed) return;
  subscribed = true;
  subscribeToEvent<{ taskId?: string }>("task.created", async (data) => {
    createdEvents.push(data);
  });
}

async function insertTemplate(
  workspaceId: string,
  createdBy: string,
  tasks: unknown[],
) {
  const [row] = await db
    .insert(schema.templateTable)
    .values({
      workspaceId,
      createdBy,
      name: "Escrita a mano",
      kind: "task",
      content: { tasks },
    })
    .returning();

  return row;
}

async function createTask({
  projectId,
  title,
  parent,
  estimate,
}: {
  projectId: string;
  title: string;
  parent?: { id: string; path: string; depth: number };
  estimate?: number;
}) {
  counter += 1;
  const tree = parent ? childTreeValues(parent) : taskTreeValues();

  const [task] = await db
    .insert(schema.taskTable)
    .values({
      ...tree,
      projectId,
      title,
      status: "to-do",
      priority: "medium",
      number: counter,
      position: counter,
      estimate: estimate ?? null,
    })
    .returning();

  // `create-task` reparte los numeros desde `project.last_task_number`. Un
  // insert directo que no lo mueva deja al siguiente `createTask` repitiendo el
  // numero 1 y chocando con `task_project_number_unique`. El fixture tiene que
  // dejar el proyecto como lo dejaria la aplicacion.
  await db
    .update(schema.projectTable)
    .set({ lastTaskNumber: counter })
    .where(eq(schema.projectTable.id, projectId));

  return task;
}

describe("API integration: templates", () => {
  beforeEach(async () => {
    await resetTestDatabase();
    counter = 0;
  });

  // Lo que da nombre a la rebanada: la plantilla despliega su jerarquia
  // completa, no una lista plana.
  it("captures a subtree and deploys it with its hierarchy intact", async () => {
    const member = await createWorkspaceMember({ role: "admin" });
    const { project } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });

    const root = await createTask({
      projectId: project.id,
      title: "Lanzamiento",
      estimate: 3600,
    });
    const child = await createTask({
      projectId: project.id,
      title: "Preparar",
      parent: root,
    });
    await createTask({
      projectId: project.id,
      title: "Revisar copia",
      parent: child,
    });

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const captured = await app.request(`/api/template/from-task/${root.id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Plantilla de lanzamiento" }),
    });
    expect(captured.status).toBe(200);
    const template = (await captured.json()) as { id: string };

    const applied = await app.request(`/api/template/${template.id}/apply`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectId: project.id }),
    });
    expect(applied.status).toBe(200);
    expect(await applied.json()).toMatchObject({ createdTaskCount: 3 });

    const all = await db
      .select({
        id: schema.taskTable.id,
        title: schema.taskTable.title,
        parentId: schema.taskTable.parentId,
        depth: schema.taskTable.depth,
        path: schema.taskTable.path,
        estimate: schema.taskTable.estimate,
      })
      .from(schema.taskTable)
      .where(eq(schema.taskTable.projectId, project.id));

    // Tres originales + tres desplegadas.
    expect(all).toHaveLength(6);

    const copies = all.filter((task) => task.id !== root.id);
    const newRoot = copies.find(
      (task) => task.title === "Lanzamiento" && task.depth === 0,
    );
    expect(newRoot).toBeDefined();
    expect(newRoot?.estimate).toBe(3600);

    const newChild = copies.find(
      (task) => task.title === "Preparar" && task.parentId === newRoot?.id,
    );
    expect(newChild).toBeDefined();
    expect(newChild?.depth).toBe(1);

    const newGrandchild = copies.find(
      (task) =>
        task.title === "Revisar copia" && task.parentId === newChild?.id,
    );
    expect(newGrandchild).toBeDefined();
    expect(newGrandchild?.depth).toBe(2);

    // La invariante del arbol: el camino acaba en la propia tarea y la
    // profundidad concuerda. Lo vigilan dos CHECK, asi que si el desplegador
    // hubiera insertado a mano, el insert habria fallado.
    for (const task of [newRoot, newChild, newGrandchild]) {
      expect(task?.path.endsWith(`/${task.id}/`)).toBe(true);
    }
  });

  it("deploys under an existing task when a parent is given", async () => {
    const member = await createWorkspaceMember({ role: "admin" });
    const { project } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });
    const source = await createTask({ projectId: project.id, title: "Origen" });
    const host = await createTask({ projectId: project.id, title: "Destino" });

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const template = (await (
      await app.request(`/api/template/from-task/${source.id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Una" }),
      })
    ).json()) as { id: string };

    const applied = await app.request(`/api/template/${template.id}/apply`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectId: project.id, parentId: host.id }),
    });
    expect(applied.status).toBe(200);

    const [child] = await db
      .select({ depth: schema.taskTable.depth })
      .from(schema.taskTable)
      .where(
        and(
          eq(schema.taskTable.parentId, host.id),
          eq(schema.taskTable.title, "Origen"),
        ),
      );

    expect(child.depth).toBe(1);
  });

  // Sin la comprobacion previa, `createTask` rechazaria cada hija demasiado
  // profunda y la plantilla quedaria desplegada a medias.
  it("refuses a template that does not fit and creates nothing", async () => {
    const member = await createWorkspaceMember({ role: "admin" });
    const { project } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });

    // Arbol de tres niveles en un proyecto que solo admite dos.
    const root = await createTask({ projectId: project.id, title: "A" });
    const child = await createTask({
      projectId: project.id,
      title: "B",
      parent: root,
    });
    await createTask({ projectId: project.id, title: "C", parent: child });

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const template = (await (
      await app.request(`/api/template/from-task/${root.id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Honda" }),
      })
    ).json()) as { id: string };

    await db
      .update(schema.projectTable)
      .set({ maxTaskDepth: 2 })
      .where(eq(schema.projectTable.id, project.id));

    const before = await db
      .select({ id: schema.taskTable.id })
      .from(schema.taskTable)
      .where(eq(schema.taskTable.projectId, project.id));

    const applied = await app.request(`/api/template/${template.id}/apply`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectId: project.id }),
    });

    expect(applied.status).toBe(400);
    expect(await applied.text()).toContain("levels");

    const after = await db
      .select({ id: schema.taskTable.id })
      .from(schema.taskTable)
      .where(eq(schema.taskTable.projectId, project.id));

    // Nada a medias.
    expect(after).toHaveLength(before.length);
  });

  // Igual que la profundidad: un estado que el proyecto no tiene hacia fallar
  // `createTask` a mitad del arbol, con la raiz y las epicas ya creadas.
  it("refuses a status the target project lacks and creates nothing, not even epics", async () => {
    const member = await createWorkspaceMember({ role: "admin" });
    const { project } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });
    const template = await insertTemplate(member.workspace.id, member.user.id, [
      {
        title: "Raiz",
        epics: ["Nueva"],
        children: [{ title: "Hija", status: "qa" }],
      },
    ]);

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const applied = await app.request(`/api/template/${template.id}/apply`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectId: project.id }),
    });

    expect(applied.status).toBe(400);
    expect(await applied.text()).toContain("qa");
    expect(
      await db
        .select({ id: schema.taskTable.id })
        .from(schema.taskTable)
        .where(eq(schema.taskTable.projectId, project.id)),
    ).toHaveLength(0);
    expect(
      await db
        .select({ id: schema.epicTable.id })
        .from(schema.epicTable)
        .where(eq(schema.epicTable.projectId, project.id)),
    ).toHaveLength(0);
  });

  // Una plantilla viaja entre proyectos: una clave que el destino no define se
  // descarta, y un valor que no casa con su tipo se rechaza antes de crear.
  it("checks custom field values against the target project", async () => {
    const member = await createWorkspaceMember({ role: "admin" });
    const { project } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    await app.request(`/api/field/project/${project.id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Presupuesto", type: "number" }),
    });

    const apply = (templateId: string) =>
      app.request(`/api/template/${templateId}/apply`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectId: project.id }),
      });

    const wrongType = await insertTemplate(
      member.workspace.id,
      member.user.id,
      [{ title: "Mal", customFields: { presupuesto: "mucho" } }],
    );
    expect((await apply(wrongType.id)).status).toBe(400);
    expect(
      await db
        .select({ id: schema.taskTable.id })
        .from(schema.taskTable)
        .where(eq(schema.taskTable.projectId, project.id)),
    ).toHaveLength(0);

    const foreignKey = await insertTemplate(
      member.workspace.id,
      member.user.id,
      [
        {
          title: "Bien",
          customFields: { presupuesto: 1200, de_otro_proyecto: "x" },
        },
      ],
    );
    expect((await apply(foreignKey.id)).status).toBe(200);

    const [created] = await db
      .select({ customFields: schema.taskTable.customFields })
      .from(schema.taskTable)
      .where(eq(schema.taskTable.projectId, project.id));
    expect(created.customFields).toEqual({ presupuesto: 1200 });
  });

  // Sobraba un `task.created` con el id vacio al final: una notificacion basura
  // para quien aplicaba la plantilla y un aviso vacio a cada integracion.
  it("publishes one task.created per task and none without an id", async () => {
    recordCreatedEvents();
    const member = await createWorkspaceMember({ role: "admin" });
    const { project } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });
    const template = await insertTemplate(member.workspace.id, member.user.id, [
      { title: "Raiz", children: [{ title: "Hija" }] },
    ]);

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    createdEvents.length = 0;
    const applied = await app.request(`/api/template/${template.id}/apply`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectId: project.id }),
    });
    expect(applied.status).toBe(200);

    expect(createdEvents).toHaveLength(2);
    expect(createdEvents.every((event) => Boolean(event.taskId))).toBe(true);
  });

  it("carries labels and creates the epics the template names", async () => {
    const member = await createWorkspaceMember({ role: "admin" });
    const { project } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });
    const task = await createTask({
      projectId: project.id,
      title: "Con extras",
    });

    const [epic] = await db
      .insert(schema.epicTable)
      .values({ projectId: project.id, name: "Facturación" })
      .returning();
    await db
      .insert(schema.taskEpicTable)
      .values({ taskId: task.id, epicId: epic.id });
    await db.insert(schema.labelTable).values({
      workspaceId: member.workspace.id,
      taskId: task.id,
      name: "urgente",
      color: "#ff0000",
    });

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const template = (await (
      await app.request(`/api/template/from-task/${task.id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Con extras" }),
      })
    ).json()) as { id: string };

    // Otro proyecto del mismo espacio: la epica no existe ahi todavia.
    const other = await createProjectFixture({
      workspaceId: member.workspace.id,
      name: "Otro",
    });

    const applied = await app.request(`/api/template/${template.id}/apply`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectId: other.project.id }),
    });
    expect(applied.status).toBe(200);

    const epics = await db
      .select({ name: schema.epicTable.name })
      .from(schema.epicTable)
      .where(eq(schema.epicTable.projectId, other.project.id));
    expect(epics.map((row) => row.name)).toContain("Facturación");

    const [created] = await db
      .select({ id: schema.taskTable.id })
      .from(schema.taskTable)
      .where(eq(schema.taskTable.projectId, other.project.id));

    const labels = await db
      .select({ name: schema.labelTable.name })
      .from(schema.labelTable)
      .where(eq(schema.labelTable.taskId, created.id));
    expect(labels.map((row) => row.name)).toContain("urgente");
  });

  it("captures a whole project with its columns and epics", async () => {
    const member = await createWorkspaceMember({ role: "admin" });
    const { project } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });
    await createTask({ projectId: project.id, title: "Una" });

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const captured = await app.request(
      `/api/template/from-project/${project.id}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Plantilla de proyecto" }),
      },
    );
    expect(captured.status).toBe(200);

    const stored = (await captured.json()) as {
      kind: string;
      content: { columns: unknown[]; tasks: unknown[] };
    };
    expect(stored.kind).toBe("project");
    expect(stored.content.columns).toHaveLength(4);
    expect(stored.content.tasks).toHaveLength(1);
  });

  it("lists templates with their task count and deletes them", async () => {
    const member = await createWorkspaceMember({ role: "admin" });
    const { project } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });
    const root = await createTask({ projectId: project.id, title: "Raiz" });
    await createTask({ projectId: project.id, title: "Hija", parent: root });

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const template = (await (
      await app.request(`/api/template/from-task/${root.id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Dos tareas" }),
      })
    ).json()) as { id: string };

    const list = (await (
      await app.request(`/api/template/workspace/${member.workspace.id}`)
    ).json()) as Template[];

    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ name: "Dos tareas", taskCount: 2 });

    expect(
      (await app.request(`/api/template/${template.id}`, { method: "DELETE" }))
        .status,
    ).toBe(200);

    expect(
      (await (
        await app.request(`/api/template/workspace/${member.workspace.id}`)
      ).json()) as Template[],
    ).toHaveLength(0);
  });

  it("refuses a template from another workspace", async () => {
    const owner = await createWorkspaceMember({ role: "admin" });
    const other = await createWorkspaceMember({ role: "admin" });
    const mine = await createProjectFixture({
      workspaceId: owner.workspace.id,
    });
    const theirs = await createProjectFixture({
      workspaceId: other.workspace.id,
    });
    const task = await createTask({ projectId: theirs.project.id, title: "X" });

    mockAuthenticatedSession(other.user);
    const asOther = createApp();
    const template = (await (
      await asOther.app.request(`/api/template/from-task/${task.id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Ajena" }),
      })
    ).json()) as { id: string };

    mockAuthenticatedSession(owner.user);
    const { app } = createApp();

    const applied = await app.request(`/api/template/${template.id}/apply`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectId: mine.project.id }),
    });

    expect(applied.status).toBe(400);
  });

  it("refuses a plain member and anyone outside the workspace", async () => {
    const owner = await createWorkspaceMember({ role: "admin" });
    const plain = await createWorkspaceMember({ role: "member" });
    const { project } = await createProjectFixture({
      workspaceId: owner.workspace.id,
    });

    mockAuthenticatedSession(plain.user);
    const asPlain = createApp();
    expect(
      (
        await asPlain.app.request(`/api/template/from-project/${project.id}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: "X" }),
        })
      ).status,
    ).toBe(403);

    const stranger = await createWorkspaceMember({ role: "admin" });
    mockAuthenticatedSession(stranger.user);
    const asStranger = createApp();
    expect(
      (
        await asStranger.app.request(
          `/api/template/workspace/${owner.workspace.id}`,
        )
      ).status,
    ).toBe(403);
  });
});

describe("API integration: a whole project from a project template", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  async function insertProjectTemplate(
    workspaceId: string,
    createdBy: string,
    content: Record<string, unknown>,
  ) {
    const [row] = await db
      .insert(schema.templateTable)
      .values({
        workspaceId,
        createdBy,
        name: "Obra tipo",
        kind: "project",
        content,
      })
      .returning();
    return row;
  }

  function createFrom(
    app: ReturnType<typeof createApp>["app"],
    workspaceId: string,
    templateId: string,
    slug = "OBR",
  ) {
    return app.request("/api/project", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Obra nueva",
        workspaceId,
        icon: "Folder",
        slug,
        templateId,
      }),
    });
  }

  it("is born with the template's columns, epics and task tree", async () => {
    const member = await createWorkspaceMember({ role: "admin" });
    const template = await insertProjectTemplate(
      member.workspace.id,
      member.user.id,
      {
        columns: [
          { name: "Pendiente", slug: "pending", position: 0, isFinal: false },
          { name: "Entregado", slug: "delivered", position: 1, isFinal: true },
        ],
        epics: [{ name: "Fase 1", color: "#16a34a" }],
        tasks: [
          {
            title: "Replanteo",
            status: "pending",
            epics: ["Fase 1"],
            children: [{ title: "Medir", status: "delivered" }],
          },
        ],
      },
    );
    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const response = await createFrom(app, member.workspace.id, template.id);
    expect(response.status).toBe(200);
    const project = (await response.json()) as { id: string };

    const columns = await db
      .select({
        slug: schema.columnTable.slug,
        isFinal: schema.columnTable.isFinal,
      })
      .from(schema.columnTable)
      .where(eq(schema.columnTable.projectId, project.id))
      .orderBy(schema.columnTable.position);
    expect(columns).toEqual([
      { slug: "pending", isFinal: false },
      { slug: "delivered", isFinal: true },
    ]);

    const epics = await db
      .select({ name: schema.epicTable.name })
      .from(schema.epicTable)
      .where(eq(schema.epicTable.projectId, project.id));
    expect(epics).toEqual([{ name: "Fase 1" }]);

    const tasks = await db
      .select({
        id: schema.taskTable.id,
        title: schema.taskTable.title,
        parentId: schema.taskTable.parentId,
        status: schema.taskTable.status,
      })
      .from(schema.taskTable)
      .where(eq(schema.taskTable.projectId, project.id));
    const root = tasks.find((task) => task.title === "Replanteo");
    const child = tasks.find((task) => task.title === "Medir");
    expect(root?.status).toBe("pending");
    expect(child?.parentId).toBe(root?.id);
    expect(child?.status).toBe("delivered");
  });

  it("keeps the four default columns when the template brings none", async () => {
    const member = await createWorkspaceMember({ role: "admin" });
    const template = await insertProjectTemplate(
      member.workspace.id,
      member.user.id,
      { tasks: [{ title: "Una tarea" }] },
    );
    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const response = await createFrom(app, member.workspace.id, template.id);
    const project = (await response.json()) as { id: string };

    const columns = await db
      .select({ slug: schema.columnTable.slug })
      .from(schema.columnTable)
      .where(eq(schema.columnTable.projectId, project.id));
    expect(columns).toHaveLength(4);
  });

  it("leaves no half-made project behind when the tree does not fit", async () => {
    const member = await createWorkspaceMember({ role: "admin" });
    const template = await insertProjectTemplate(
      member.workspace.id,
      member.user.id,
      {
        columns: [
          { name: "Pendiente", slug: "pending", position: 0, isFinal: false },
        ],
        // Un estado que ninguna columna de la plantilla tiene.
        tasks: [{ title: "Rota", status: "no-existe" }],
      },
    );
    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const response = await createFrom(app, member.workspace.id, template.id);

    expect(response.status).toBe(400);
    const projects = await db
      .select({ id: schema.projectTable.id })
      .from(schema.projectTable)
      .where(eq(schema.projectTable.slug, "OBR"));
    expect(projects).toHaveLength(0);
  });

  it("does not take a template from another workspace", async () => {
    const member = await createWorkspaceMember({ role: "admin" });
    const stranger = await createWorkspaceMember({ role: "admin" });
    const foreign = await insertProjectTemplate(
      stranger.workspace.id,
      stranger.user.id,
      { tasks: [{ title: "Ajena" }] },
    );
    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const response = await createFrom(app, member.workspace.id, foreign.id);

    expect(response.status).toBe(404);
    const projects = await db
      .select({ id: schema.projectTable.id })
      .from(schema.projectTable)
      .where(eq(schema.projectTable.slug, "OBR"));
    expect(projects).toHaveLength(0);
  });
});
