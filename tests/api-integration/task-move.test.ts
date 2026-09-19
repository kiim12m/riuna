import { randomUUID } from "node:crypto";
import { asc, eq, inArray } from "drizzle-orm";
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

/**
 * `moveTask` cruza la frontera de proyecto, que es la unica operacion que lo
 * hace, y hasta la Fase 4.5 no tenia ninguna prueba. Cuatro de los hallazgos de
 * la auditoria vivian aqui: epicas ajenas, estados aplanados, el limite de
 * profundidad del destino ignorado y campos personalizados huerfanos.
 */

type Task = typeof schema.taskTable.$inferSelect;

async function insertTask(
  values: Partial<Task> & {
    projectId: string;
    number: number;
  },
  tree: { id: string; parentId: string | null; path: string; depth: number },
) {
  const [task] = await db
    .insert(schema.taskTable)
    .values({
      ...tree,
      title: values.title ?? "Tarea",
      status: values.status ?? "to-do",
      priority: values.priority ?? "medium",
      position: values.position ?? 0,
      ...values,
      ...tree,
    })
    .returning();

  return task;
}

async function readTasks(ids: string[]) {
  return db
    .select()
    .from(schema.taskTable)
    .where(inArray(schema.taskTable.id, ids))
    .orderBy(asc(schema.taskTable.depth));
}

async function move(
  app: ReturnType<typeof createApp>["app"],
  taskId: string,
  destinationProjectId: string,
  destinationStatus?: string,
) {
  return app.request(`/api/task/move/${taskId}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ destinationProjectId, destinationStatus }),
  });
}

describe("API integration: moving a task between projects", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  it("clears epics of the whole branch, because epics belong to a project", async () => {
    const member = await createWorkspaceMember({ role: "admin" });
    const source = await createProjectFixture({
      workspaceId: member.workspace.id,
    });
    const destination = await createProjectFixture({
      workspaceId: member.workspace.id,
    });

    const rootTree = taskTreeValues();
    const root = await insertTask(
      {
        projectId: source.project.id,
        number: 1,
        columnId: source.columns.todo.id,
      },
      rootTree,
    );
    const child = await insertTask(
      {
        projectId: source.project.id,
        number: 2,
        columnId: source.columns.todo.id,
      },
      childTreeValues(root),
    );

    const [epic] = await db
      .insert(schema.epicTable)
      .values({
        projectId: source.project.id,
        name: "Migracion Q1",
        color: "#123456",
        position: 0,
      })
      .returning();

    await db.insert(schema.taskEpicTable).values([
      { taskId: root.id, epicId: epic.id },
      { taskId: child.id, epicId: epic.id },
    ]);

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const response = await move(app, root.id, destination.project.id);
    expect(response.status).toBe(200);

    const remaining = await db
      .select()
      .from(schema.taskEpicTable)
      .where(inArray(schema.taskEpicTable.taskId, [root.id, child.id]));

    expect(remaining).toEqual([]);
  });

  it("keeps every descendant's own status instead of stamping the root's", async () => {
    const member = await createWorkspaceMember({ role: "admin" });
    const source = await createProjectFixture({
      workspaceId: member.workspace.id,
    });
    const destination = await createProjectFixture({
      workspaceId: member.workspace.id,
    });

    const rootTree = taskTreeValues();
    const root = await insertTask(
      {
        projectId: source.project.id,
        number: 1,
        status: "to-do",
        columnId: source.columns.todo.id,
      },
      rootTree,
    );
    const doneChild = await insertTask(
      {
        projectId: source.project.id,
        number: 2,
        status: "done",
        columnId: source.columns.done.id,
      },
      childTreeValues(root),
    );
    const archivedChild = await insertTask(
      {
        projectId: source.project.id,
        number: 3,
        status: "archived",
        columnId: null,
      },
      childTreeValues(root),
    );

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const response = await move(app, root.id, destination.project.id);
    expect(response.status).toBe(200);

    const moved = await readTasks([root.id, doneChild.id, archivedChild.id]);
    const byId = new Map(moved.map((task) => [task.id, task]));

    expect(byId.get(root.id)?.status).toBe("to-do");
    // Lo terminado no se reabre y lo archivado no vuelve al tablero.
    expect(byId.get(doneChild.id)?.status).toBe("done");
    expect(byId.get(archivedChild.id)?.status).toBe("archived");
    expect(byId.get(archivedChild.id)?.columnId).toBeNull();

    for (const task of moved) {
      expect(task.projectId).toBe(destination.project.id);
    }
  });

  it("refuses a branch deeper than the destination's task depth limit", async () => {
    const member = await createWorkspaceMember({ role: "admin" });
    const source = await createProjectFixture({
      workspaceId: member.workspace.id,
    });
    const destination = await createProjectFixture({
      workspaceId: member.workspace.id,
    });

    await db
      .update(schema.projectTable)
      .set({ maxTaskDepth: 2 })
      .where(eq(schema.projectTable.id, destination.project.id));

    // Tres niveles: raiz, hija, nieta.
    const rootTree = taskTreeValues();
    const root = await insertTask(
      {
        projectId: source.project.id,
        number: 1,
        columnId: source.columns.todo.id,
      },
      rootTree,
    );
    const child = await insertTask(
      {
        projectId: source.project.id,
        number: 2,
        columnId: source.columns.todo.id,
      },
      childTreeValues(root),
    );
    await insertTask(
      {
        projectId: source.project.id,
        number: 3,
        columnId: source.columns.todo.id,
      },
      childTreeValues(child),
    );

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const response = await move(app, root.id, destination.project.id);

    expect(response.status).toBe(400);
    const [stillThere] = await readTasks([root.id]);
    expect(stillThere.projectId).toBe(source.project.id);
  });

  it("drops custom field values the destination does not define, and keeps workspace-scoped ones", async () => {
    const member = await createWorkspaceMember({ role: "admin" });
    const source = await createProjectFixture({
      workspaceId: member.workspace.id,
    });
    const destination = await createProjectFixture({
      workspaceId: member.workspace.id,
    });

    await db.insert(schema.fieldDefinitionTable).values([
      {
        workspaceId: member.workspace.id,
        projectId: source.project.id,
        key: "presupuesto",
        name: "Presupuesto",
        type: "number",
        config: {},
        position: 0,
      },
      {
        workspaceId: member.workspace.id,
        projectId: null,
        key: "expediente",
        name: "Expediente",
        type: "text",
        config: {},
        position: 1,
      },
    ]);

    const rootTree = taskTreeValues();
    const root = await insertTask(
      {
        projectId: source.project.id,
        number: 1,
        columnId: source.columns.todo.id,
        customFields: { presupuesto: 50000, expediente: "EXP-1" },
      },
      rootTree,
    );

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const response = await move(app, root.id, destination.project.id);
    expect(response.status).toBe(200);

    const [moved] = await readTasks([root.id]);

    // El de alcance proyecto se va con su proyecto; el de espacio sobrevive.
    expect(moved.customFields).toEqual({ expediente: "EXP-1" });
  });

  it("keeps the branch shape, renumbers it, and reroots the moved task", async () => {
    const member = await createWorkspaceMember({ role: "admin" });
    const source = await createProjectFixture({
      workspaceId: member.workspace.id,
    });
    const destination = await createProjectFixture({
      workspaceId: member.workspace.id,
    });

    const rootTree = taskTreeValues();
    const root = await insertTask(
      {
        projectId: source.project.id,
        number: 7,
        columnId: source.columns.todo.id,
      },
      rootTree,
    );
    const child = await insertTask(
      {
        projectId: source.project.id,
        number: 8,
        columnId: source.columns.todo.id,
      },
      childTreeValues(root),
    );

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const response = await move(app, root.id, destination.project.id);
    expect(response.status).toBe(200);

    const moved = await readTasks([root.id, child.id]);
    const byId = new Map(moved.map((task) => [task.id, task]));

    const movedRoot = byId.get(root.id);
    const movedChild = byId.get(child.id);

    expect(movedRoot?.parentId).toBeNull();
    expect(movedRoot?.path).toBe(`/${root.id}/`);
    expect(movedRoot?.depth).toBe(0);

    expect(movedChild?.parentId).toBe(root.id);
    expect(movedChild?.path).toBe(`/${root.id}/${child.id}/`);
    expect(movedChild?.depth).toBe(1);

    // Numeros nuevos del proyecto destino, que empieza vacio.
    expect(movedRoot?.number).toBe(1);
    expect(movedChild?.number).toBe(2);
  });

  it("moves a branch that a sibling project keeps untouched", async () => {
    const member = await createWorkspaceMember({ role: "admin" });
    const source = await createProjectFixture({
      workspaceId: member.workspace.id,
    });
    const destination = await createProjectFixture({
      workspaceId: member.workspace.id,
    });

    const parentTree = taskTreeValues();
    const parent = await insertTask(
      {
        projectId: source.project.id,
        number: 1,
        columnId: source.columns.todo.id,
      },
      parentTree,
    );
    const staying = await insertTask(
      {
        projectId: source.project.id,
        number: 2,
        columnId: source.columns.todo.id,
      },
      childTreeValues(parent),
    );
    const leaving = await insertTask(
      {
        projectId: source.project.id,
        number: 3,
        columnId: source.columns.todo.id,
      },
      childTreeValues(parent),
    );

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const response = await move(app, leaving.id, destination.project.id);
    expect(response.status).toBe(200);

    const [remaining] = await readTasks([staying.id]);
    expect(remaining.projectId).toBe(source.project.id);
    expect(remaining.parentId).toBe(parent.id);
    expect(remaining.path).toBe(`${parent.path}${staying.id}/`);
  });

  it("refuses to move across workspaces", async () => {
    const member = await createWorkspaceMember({ role: "admin" });
    const elsewhere = await createWorkspaceMember({ role: "admin" });
    const source = await createProjectFixture({
      workspaceId: member.workspace.id,
    });
    const destination = await createProjectFixture({
      workspaceId: elsewhere.workspace.id,
    });

    const rootTree = taskTreeValues(`task-${randomUUID()}`);
    const root = await insertTask(
      {
        projectId: source.project.id,
        number: 1,
        columnId: source.columns.todo.id,
      },
      rootTree,
    );

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const response = await move(app, root.id, destination.project.id);

    expect(response.status).not.toBe(200);
    const [stillThere] = await readTasks([root.id]);
    expect(stillThere.projectId).toBe(source.project.id);
  });
});
