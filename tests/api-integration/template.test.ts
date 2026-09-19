import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import db, { schema } from "../../apps/api/src/database";
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
