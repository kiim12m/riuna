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

async function insertTask(
  projectId: string,
  columnId: string,
  status = "to-do",
) {
  taskNumber += 1;

  const [task] = await db
    .insert(schema.taskTable)
    .values({
      ...taskTreeValues(),
      projectId,
      title: `Task ${taskNumber}`,
      status,
      columnId,
      priority: "medium",
      number: taskNumber,
      position: taskNumber,
    })
    .returning();

  if (!task) throw new Error("Failed to seed task");
  return task;
}

async function setup(role = "admin") {
  const member = await createWorkspaceMember({ role });
  const fixture = await createProjectFixture({
    workspaceId: member.workspace.id,
  });
  mockAuthenticatedSession(member.user);
  return { member, ...fixture, app: createApp().app };
}

function createEpic(
  app: ReturnType<typeof createApp>["app"],
  projectId: string,
  name: string,
) {
  return app.request(`/api/epic/project/${projectId}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, color: "teal" }),
  });
}

describe("API integration: epics", () => {
  beforeEach(async () => {
    await resetTestDatabase();
    taskNumber = 0;
  });

  it("creates an epic and lists it with an empty count", async () => {
    const { project, app } = await setup();

    const created = await createEpic(app, project.id, "Migración");
    expect(created.status).toBe(200);

    const listed = await app.request(`/api/epic/project/${project.id}`);
    const epics = (await listed.json()) as Array<{
      name: string;
      taskCount: number;
      doneTaskCount: number;
    }>;

    expect(epics).toHaveLength(1);
    expect(epics[0].name).toBe("Migración");
    expect(epics[0].taskCount).toBe(0);
    expect(epics[0].doneTaskCount).toBe(0);
  });

  it("counts the tasks of an epic and how many are closed", async () => {
    const { project, columns, app } = await setup();
    const created = await createEpic(app, project.id, "Cuentas locales");
    const epic = (await created.json()) as { id: string };

    const open = await insertTask(project.id, columns.todo.id);
    const closed = await insertTask(project.id, columns.done.id, "done");

    for (const task of [open, closed]) {
      const response = await app.request(`/api/epic/task/${task.id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ epicIds: [epic.id] }),
      });
      expect(response.status).toBe(200);
    }

    const listed = await app.request(`/api/epic/project/${project.id}`);
    const epics = (await listed.json()) as Array<{
      taskCount: number;
      doneTaskCount: number;
    }>;

    expect(epics[0].taskCount).toBe(2);
    expect(epics[0].doneTaskCount).toBe(1);
  });

  it("replaces the whole set of epics on each call", async () => {
    const { project, columns, app } = await setup();
    const first = (await (await createEpic(app, project.id, "Uno")).json()) as {
      id: string;
    };
    const second = (await (
      await createEpic(app, project.id, "Dos")
    ).json()) as { id: string };

    const task = await insertTask(project.id, columns.todo.id);

    await app.request(`/api/epic/task/${task.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ epicIds: [first.id, second.id] }),
    });

    // La segunda llamada manda el conjunto entero: quedarse solo con una tiene
    // que soltar la otra, no acumularlas.
    await app.request(`/api/epic/task/${task.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ epicIds: [second.id] }),
    });

    const rows = await db
      .select({ epicId: schema.taskEpicTable.epicId })
      .from(schema.taskEpicTable)
      .where(eq(schema.taskEpicTable.taskId, task.id));

    expect(rows).toHaveLength(1);
    expect(rows[0].epicId).toBe(second.id);
  });

  it("refuses an epic that belongs to another project", async () => {
    const { member, project, columns, app } = await setup();
    const other = await createProjectFixture({
      workspaceId: member.workspace.id,
      slug: "other",
    });

    const foreign = (await (
      await createEpic(app, other.project.id, "Ajena")
    ).json()) as { id: string };

    const task = await insertTask(project.id, columns.todo.id);

    const response = await app.request(`/api/epic/task/${task.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ epicIds: [foreign.id] }),
    });

    expect(response.status).toBe(400);
    expect(await response.text()).toContain("must belong to the task");
  });

  it("hides an archived epic from the default listing but keeps its tasks", async () => {
    const { project, columns, app } = await setup();
    const epic = (await (
      await createEpic(app, project.id, "Terminada")
    ).json()) as { id: string };

    const task = await insertTask(project.id, columns.todo.id);
    await app.request(`/api/epic/task/${task.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ epicIds: [epic.id] }),
    });

    const archived = await app.request(`/api/epic/${epic.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ archived: true }),
    });
    expect(archived.status).toBe(200);

    const listed = await app.request(`/api/epic/project/${project.id}`);
    expect(await listed.json()).toHaveLength(0);

    const withArchived = await app.request(
      `/api/epic/project/${project.id}?includeArchived=true`,
    );
    expect(await withArchived.json()).toHaveLength(1);

    // Archivar no descuelga las tareas: solo retira la epica de los selectores.
    const links = await db
      .select()
      .from(schema.taskEpicTable)
      .where(eq(schema.taskEpicTable.taskId, task.id));
    expect(links).toHaveLength(1);
  });

  it("keeps the tasks when the epic is deleted", async () => {
    const { project, columns, app } = await setup();
    const epic = (await (
      await createEpic(app, project.id, "Descartada")
    ).json()) as { id: string };

    const task = await insertTask(project.id, columns.todo.id);
    await app.request(`/api/epic/task/${task.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ epicIds: [epic.id] }),
    });

    const deleted = await app.request(`/api/epic/${epic.id}`, {
      method: "DELETE",
    });
    expect(deleted.status).toBe(200);

    const [survivor] = await db
      .select({ id: schema.taskTable.id })
      .from(schema.taskTable)
      .where(eq(schema.taskTable.id, task.id));
    expect(survivor).toBeDefined();

    const links = await db
      .select()
      .from(schema.taskEpicTable)
      .where(eq(schema.taskEpicTable.taskId, task.id));
    expect(links).toHaveLength(0);
  });

  it("filters the task list down to one epic", async () => {
    const { project, columns, app } = await setup();
    const epic = (await (
      await createEpic(app, project.id, "Filtrada")
    ).json()) as { id: string };

    const inside = await insertTask(project.id, columns.todo.id);
    await insertTask(project.id, columns.todo.id);

    await app.request(`/api/epic/task/${inside.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ epicIds: [epic.id] }),
    });

    const response = await app.request(
      `/api/task/tasks/${project.id}?epicId=${epic.id}`,
    );
    const body = (await response.json()) as {
      data: { columns: Array<{ tasks: Array<{ id: string }> }> };
    };

    const returned = body.data.columns.flatMap((column) => column.tasks);
    expect(returned).toHaveLength(1);
    expect(returned[0].id).toBe(inside.id);
  });

  it("refuses epic creation to someone who cannot update the project", async () => {
    const member = await createWorkspaceMember({ role: "member" });
    const { project } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const response = await createEpic(app, project.id, "No debería existir");
    expect(response.status).toBe(403);

    const epics = await db
      .select()
      .from(schema.epicTable)
      .where(eq(schema.epicTable.projectId, project.id));
    expect(epics).toHaveLength(0);
  });
});
