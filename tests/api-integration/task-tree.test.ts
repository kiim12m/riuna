import { eq, sql } from "drizzle-orm";
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

type TaskRow = typeof schema.taskTable.$inferSelect;

let taskNumber = 0;

async function insertTask({
  projectId,
  columnId,
  status = "to-do",
  title = "Task",
  parent,
  estimate,
  startDate,
  dueDate,
}: {
  projectId: string;
  columnId?: string | null;
  status?: string;
  title?: string;
  parent?: TaskRow;
  estimate?: number;
  startDate?: Date;
  dueDate?: Date;
}): Promise<TaskRow> {
  taskNumber += 1;

  // Se reserva el numero como lo hace la API, subiendo el contador del
  // proyecto: sembrar tareas a mano sin tocarlo dejaria al controlador
  // repartiendo numeros ya usados y chocando con el indice unico.
  const [claimed] = await db
    .update(schema.projectTable)
    .set({ lastTaskNumber: sql`${schema.projectTable.lastTaskNumber} + 1` })
    .where(eq(schema.projectTable.id, projectId))
    .returning({ number: schema.projectTable.lastTaskNumber });

  const [task] = await db
    .insert(schema.taskTable)
    .values({
      ...(parent ? childTreeValues(parent) : taskTreeValues()),
      projectId,
      title,
      status,
      columnId: columnId ?? null,
      priority: "medium",
      number: claimed?.number ?? taskNumber,
      position: taskNumber,
      estimate: estimate ?? null,
      startDate: startDate ?? null,
      dueDate: dueDate ?? null,
    })
    .returning();

  if (!task) throw new Error("Failed to seed task");
  return task;
}

async function readTask(id: string) {
  const [row] = await db
    .select()
    .from(schema.taskTable)
    .where(eq(schema.taskTable.id, id));

  if (!row) throw new Error(`Task ${id} is gone`);
  return row;
}

async function setup(role = "admin") {
  const member = await createWorkspaceMember({ role });
  const fixture = await createProjectFixture({
    workspaceId: member.workspace.id,
  });
  mockAuthenticatedSession(member.user);
  return { member, ...fixture, app: createApp().app };
}

function reparent(app: ReturnType<typeof createApp>["app"]) {
  return (taskId: string, parentId: string | null) =>
    app.request(`/api/task/parent/${taskId}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ parentId }),
    });
}

describe("API integration: task tree", () => {
  beforeEach(async () => {
    await resetTestDatabase();
    taskNumber = 0;
  });

  it("hangs a task under another and rewrites its whole branch", async () => {
    const { project, columns, app } = await setup();
    const root = await insertTask({
      projectId: project.id,
      columnId: columns.todo.id,
      title: "Root",
    });
    const branch = await insertTask({
      projectId: project.id,
      columnId: columns.todo.id,
      title: "Branch",
    });
    const leaf = await insertTask({
      projectId: project.id,
      columnId: columns.todo.id,
      title: "Leaf",
      parent: branch,
    });

    const response = await reparent(app)(branch.id, root.id);
    expect(response.status).toBe(200);

    const movedBranch = await readTask(branch.id);
    const movedLeaf = await readTask(leaf.id);

    expect(movedBranch.parentId).toBe(root.id);
    expect(movedBranch.path).toBe(`/${root.id}/${branch.id}/`);
    expect(movedBranch.depth).toBe(1);

    // La nieta no se ha tocado explicitamente y aun asi sigue coherente: es lo
    // que la reescritura por prefijo tiene que garantizar.
    expect(movedLeaf.parentId).toBe(branch.id);
    expect(movedLeaf.path).toBe(`/${root.id}/${branch.id}/${leaf.id}/`);
    expect(movedLeaf.depth).toBe(2);
  });

  it("refuses to move a task inside its own subtree", async () => {
    const { project, columns, app } = await setup();
    const root = await insertTask({
      projectId: project.id,
      columnId: columns.todo.id,
    });
    const child = await insertTask({
      projectId: project.id,
      columnId: columns.todo.id,
      parent: root,
    });

    const response = await reparent(app)(root.id, child.id);
    expect(response.status).toBe(400);

    const stored = await readTask(root.id);
    expect(stored.parentId).toBeNull();
    expect(stored.path).toBe(`/${root.id}/`);
  });

  it("refuses a parent from another project", async () => {
    const { member, project, columns, app } = await setup();
    const other = await createProjectFixture({
      workspaceId: member.workspace.id,
      slug: "other-project",
    });

    const here = await insertTask({
      projectId: project.id,
      columnId: columns.todo.id,
    });
    const there = await insertTask({
      projectId: other.project.id,
      columnId: other.columns.todo.id,
    });

    const response = await reparent(app)(here.id, there.id);
    expect(response.status).toBe(400);
    expect(await response.text()).toContain("same project");
  });

  it("refuses a branch that would break the project depth limit", async () => {
    const { project, columns, app } = await setup();

    await db
      .update(schema.projectTable)
      .set({ maxTaskDepth: 2 })
      .where(eq(schema.projectTable.id, project.id));

    const target = await insertTask({
      projectId: project.id,
      columnId: columns.todo.id,
    });
    const branch = await insertTask({
      projectId: project.id,
      columnId: columns.todo.id,
    });
    await insertTask({
      projectId: project.id,
      columnId: columns.todo.id,
      parent: branch,
    });

    // La rama mide dos niveles; colgarla de otra raiz pediria tres.
    const response = await reparent(app)(branch.id, target.id);
    expect(response.status).toBe(400);
    expect(await response.text()).toContain("depth limit");
  });

  it("promotes a task back to the root of the project", async () => {
    const { project, columns, app } = await setup();
    const root = await insertTask({
      projectId: project.id,
      columnId: columns.todo.id,
    });
    const child = await insertTask({
      projectId: project.id,
      columnId: columns.todo.id,
      parent: root,
    });

    const response = await reparent(app)(child.id, null);
    expect(response.status).toBe(200);

    const stored = await readTask(child.id);
    expect(stored.parentId).toBeNull();
    expect(stored.depth).toBe(0);
    expect(stored.path).toBe(`/${child.id}/`);
  });

  it("lifts the children when their parent is deleted", async () => {
    const { project, columns, app } = await setup();
    const grandparent = await insertTask({
      projectId: project.id,
      columnId: columns.todo.id,
    });
    const parent = await insertTask({
      projectId: project.id,
      columnId: columns.todo.id,
      parent: grandparent,
    });
    const child = await insertTask({
      projectId: project.id,
      columnId: columns.todo.id,
      parent,
    });

    const response = await app.request(`/api/task/${parent.id}`, {
      method: "DELETE",
    });
    expect(response.status).toBe(200);

    const lifted = await readTask(child.id);
    expect(lifted.parentId).toBe(grandparent.id);
    expect(lifted.path).toBe(`/${grandparent.id}/${child.id}/`);
    expect(lifted.depth).toBe(1);
  });

  it("moves the whole branch when the task changes project", async () => {
    const { member, project, columns, app } = await setup();
    const other = await createProjectFixture({
      workspaceId: member.workspace.id,
      slug: "destination",
    });

    const parent = await insertTask({
      projectId: project.id,
      columnId: columns.todo.id,
    });
    const child = await insertTask({
      projectId: project.id,
      columnId: columns.todo.id,
      parent,
    });

    const response = await app.request(`/api/task/move/${parent.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ destinationProjectId: other.project.id }),
    });
    expect(response.status).toBe(200);

    const movedParent = await readTask(parent.id);
    const movedChild = await readTask(child.id);

    expect(movedParent.projectId).toBe(other.project.id);
    expect(movedChild.projectId).toBe(other.project.id);
    expect(movedChild.parentId).toBe(parent.id);
    expect(movedChild.path).toBe(`/${parent.id}/${child.id}/`);
    // Numeros nuevos y sin chocar en el proyecto de destino.
    expect(movedParent.number).not.toBe(movedChild.number);
  });

  describe("cascade", () => {
    it("leaves the branch alone while the project has cascade off", async () => {
      const { project, columns, app } = await setup();
      const parent = await insertTask({
        projectId: project.id,
        columnId: columns.todo.id,
      });
      const child = await insertTask({
        projectId: project.id,
        columnId: columns.todo.id,
        parent,
      });

      const response = await app.request(`/api/task/status/${parent.id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "done" }),
      });
      expect(response.status).toBe(200);

      expect((await readTask(child.id)).status).toBe("to-do");
    });

    it("closes the whole branch once the project asks for it", async () => {
      const { project, columns, app } = await setup();

      await db
        .update(schema.projectTable)
        .set({ cascadeClose: true })
        .where(eq(schema.projectTable.id, project.id));

      const parent = await insertTask({
        projectId: project.id,
        columnId: columns.todo.id,
      });
      const child = await insertTask({
        projectId: project.id,
        columnId: columns.todo.id,
        parent,
      });
      const grandchild = await insertTask({
        projectId: project.id,
        columnId: columns.todo.id,
        parent: child,
      });

      const response = await app.request(`/api/task/status/${parent.id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "done" }),
      });
      expect(response.status).toBe(200);

      const movedChild = await readTask(child.id);
      expect(movedChild.status).toBe("done");
      expect((await readTask(grandchild.id)).status).toBe("done");
      // La columna tambien baja, no solo el slug: si no, el tablero seguiria
      // enseñando la tarjeta en la columna vieja.
      expect(movedChild.columnId).toBe(columns.done.id);
    });

    // La barra de seleccion multiple archiva y cierra por `PATCH /task/bulk`,
    // que se saltaba la cascada que la via de una sola tarea si aplica.
    it("archives the whole branch when the parent is archived in bulk", async () => {
      const { project, columns, app } = await setup();

      await db
        .update(schema.projectTable)
        .set({ cascadeArchive: true })
        .where(eq(schema.projectTable.id, project.id));

      const parent = await insertTask({
        projectId: project.id,
        columnId: columns.todo.id,
      });
      const child = await insertTask({
        projectId: project.id,
        columnId: columns.todo.id,
        parent,
      });
      const grandchild = await insertTask({
        projectId: project.id,
        columnId: columns.todo.id,
        parent: child,
      });

      const response = await app.request("/api/task/bulk", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          taskIds: [parent.id],
          operation: "updateStatus",
          value: "archived",
        }),
      });
      expect(response.status).toBe(200);

      expect((await readTask(child.id)).status).toBe("archived");
      expect((await readTask(grandchild.id)).status).toBe("archived");
    });

    // Un lote con varias ramas comparte cerrojo y transaccion, asi que se
    // comprueba lo que eso puede romper: que todas las ramas bajen y que una
    // descendiente alcanzable desde dos seleccionadas se mueva y se anote una
    // sola vez.
    it("cascades every selected branch once in a single bulk request", async () => {
      const { project, columns, app } = await setup();

      await db
        .update(schema.projectTable)
        .set({ cascadeArchive: true })
        .where(eq(schema.projectTable.id, project.id));

      const branch = async () => {
        const parent = await insertTask({
          projectId: project.id,
          columnId: columns.todo.id,
        });
        const child = await insertTask({
          projectId: project.id,
          columnId: columns.todo.id,
          parent,
        });
        const grandchild = await insertTask({
          projectId: project.id,
          columnId: columns.todo.id,
          parent: child,
        });
        return { parent, child, grandchild };
      };

      const first = await branch();
      const second = await branch();

      const cascaded: { taskId: string; cascadedFrom?: string }[] = [];
      await subscribeToEvent<{ taskId: string; cascadedFrom?: string }>(
        "task.status_changed",
        async (data) => {
          if (data.cascadedFrom) cascaded.push(data);
        },
      );

      const response = await app.request("/api/task/bulk", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          // La hija de la primera rama va tambien en la seleccion: su subarbol
          // se solapa con el de su madre.
          taskIds: [first.parent.id, first.child.id, second.parent.id],
          operation: "updateStatus",
          value: "archived",
        }),
      });
      expect(response.status).toBe(200);

      for (const task of [first.grandchild, second.child, second.grandchild]) {
        expect((await readTask(task.id)).status).toBe("archived");
      }

      // Una sola anotacion por descendiente, y la nieta solapada atribuida a
      // la mas alta de las dos seleccionadas que la alcanzan.
      expect(cascaded.map((event) => event.taskId).sort()).toEqual(
        [first.grandchild.id, second.child.id, second.grandchild.id].sort(),
      );
      expect(
        cascaded.find((event) => event.taskId === first.grandchild.id)
          ?.cascadedFrom,
      ).toBe(first.parent.id);
    });

    it("does not cascade a move to a column that is not final", async () => {
      const { project, columns, app } = await setup();

      await db
        .update(schema.projectTable)
        .set({ cascadeClose: true })
        .where(eq(schema.projectTable.id, project.id));

      const parent = await insertTask({
        projectId: project.id,
        columnId: columns.todo.id,
      });
      const child = await insertTask({
        projectId: project.id,
        columnId: columns.todo.id,
        parent,
      });

      await app.request(`/api/task/status/${parent.id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "in-progress" }),
      });

      expect((await readTask(child.id)).status).toBe("to-do");
    });
  });

  describe("subtree aggregates", () => {
    it("counts uneven branches and ignores archived tasks", async () => {
      const { project, columns, app } = await setup();

      const root = await insertTask({
        projectId: project.id,
        columnId: columns.todo.id,
        title: "Root",
        estimate: 3600,
        startDate: new Date("2026-03-10T00:00:00.000Z"),
        dueDate: new Date("2026-03-12T00:00:00.000Z"),
      });

      // Rama larga: una hija con una nieta cerrada.
      const long = await insertTask({
        projectId: project.id,
        columnId: columns.todo.id,
        parent: root,
        estimate: 7200,
        startDate: new Date("2026-03-05T00:00:00.000Z"),
      });
      const deepest = await insertTask({
        projectId: project.id,
        columnId: columns.done.id,
        status: "done",
        parent: long,
        dueDate: new Date("2026-03-20T00:00:00.000Z"),
      });

      // Rama corta: una sola hija, abierta.
      await insertTask({
        projectId: project.id,
        columnId: columns.todo.id,
        parent: root,
      });

      // Y una hija archivada, que no debe contar para nada.
      await insertTask({
        projectId: project.id,
        columnId: null,
        status: "archived",
        parent: root,
        estimate: 99999,
        dueDate: new Date("2030-01-01T00:00:00.000Z"),
      });

      const response = await app.request(`/api/task/${root.id}`);
      expect(response.status).toBe(200);

      const body = (await response.json()) as {
        subtree: {
          childCount: number;
          descendantCount: number;
          descendantDoneCount: number;
          progress: number;
          startDate: string;
          dueDate: string;
          estimateSeconds: number;
        };
      };

      // Tres descendientes vivos: dos hijas y una nieta, una de ellas cerrada.
      expect(body.subtree.descendantCount).toBe(3);
      expect(body.subtree.descendantDoneCount).toBe(1);
      expect(body.subtree.progress).toBe(33);
      // Dos hijas directas: la archivada no cuenta.
      expect(body.subtree.childCount).toBe(2);
      // La rama empieza antes que el padre y acaba despues. Se compara con lo
      // que la base guardo y no con la cadena literal: la columna es
      // `timestamp` sin zona y el driver la escribe en hora local.
      expect(body.subtree.startDate).toBe(long.startDate?.toISOString());
      expect(body.subtree.dueDate).toBe(deepest.dueDate?.toISOString());
      // La estimacion suma el padre y la rama viva, no la archivada.
      expect(body.subtree.estimateSeconds).toBe(10800);
    });

    it("gives a leaf no aggregate at all", async () => {
      const { project, columns, app } = await setup();
      const leaf = await insertTask({
        projectId: project.id,
        columnId: columns.todo.id,
      });

      const response = await app.request(`/api/task/${leaf.id}`);
      const body = (await response.json()) as { subtree: unknown };

      expect(body.subtree).toBeNull();
    });

    it("adds logged time from the whole branch", async () => {
      const { member, project, columns, app } = await setup();

      const parent = await insertTask({
        projectId: project.id,
        columnId: columns.todo.id,
      });
      const child = await insertTask({
        projectId: project.id,
        columnId: columns.todo.id,
        parent,
      });

      await db.insert(schema.timeEntryTable).values([
        {
          taskId: parent.id,
          userId: member.user.id,
          startTime: new Date("2026-03-10T09:00:00.000Z"),
          endTime: new Date("2026-03-10T10:00:00.000Z"),
          duration: 3600,
        },
        {
          taskId: child.id,
          userId: member.user.id,
          startTime: new Date("2026-03-10T10:00:00.000Z"),
          endTime: new Date("2026-03-10T10:30:00.000Z"),
          duration: 1800,
        },
      ]);

      const response = await app.request(`/api/task/${parent.id}`);
      const body = (await response.json()) as {
        subtree: { loggedSeconds: number };
      };

      expect(body.subtree.loggedSeconds).toBe(5400);
    });
  });

  it("creates a task already hanging from its parent", async () => {
    const { project, columns, app } = await setup();
    const parent = await insertTask({
      projectId: project.id,
      columnId: columns.todo.id,
    });

    const response = await app.request(`/api/task/${project.id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Nested from birth",
        description: "",
        status: "to-do",
        priority: "medium",
        parentId: parent.id,
      }),
    });

    expect(response.status).toBe(200);
    const created = (await response.json()) as { id: string };
    const stored = await readTask(created.id);

    expect(stored.parentId).toBe(parent.id);
    expect(stored.path).toBe(`/${parent.id}/${created.id}/`);
    expect(stored.depth).toBe(1);
  });

  it("keeps every path coherent with its parent pointer", async () => {
    const { project, columns, app } = await setup();

    const a = await insertTask({
      projectId: project.id,
      columnId: columns.todo.id,
    });
    const b = await insertTask({
      projectId: project.id,
      columnId: columns.todo.id,
      parent: a,
    });
    const c = await insertTask({
      projectId: project.id,
      columnId: columns.todo.id,
      parent: b,
    });
    const d = await insertTask({
      projectId: project.id,
      columnId: columns.todo.id,
    });

    // Una tanda de movimientos, incluido uno ilegal, para comprobar la
    // invariante sobre un arbol removido y no sobre el recien sembrado.
    await reparent(app)(b.id, d.id);
    await reparent(app)(a.id, c.id);
    await reparent(app)(a.id, null);

    const rows = await db
      .select()
      .from(schema.taskTable)
      .where(eq(schema.taskTable.projectId, project.id));

    const byId = new Map(rows.map((row) => [row.id, row]));

    for (const row of rows) {
      const parent = row.parentId ? byId.get(row.parentId) : null;
      const expectedPath = parent ? `${parent.path}${row.id}/` : `/${row.id}/`;

      expect(row.path).toBe(expectedPath);
      expect(row.depth).toBe(row.path.split("/").filter(Boolean).length - 1);
    }
  });
});

describe("API integration: task tree permissions", () => {
  beforeEach(async () => {
    await resetTestDatabase();
    taskNumber = 0;
  });

  it("refuses reparenting to someone who cannot update tasks", async () => {
    const viewer = await createWorkspaceMember({ role: "viewer" });
    const { project, columns } = await createProjectFixture({
      workspaceId: viewer.workspace.id,
    });

    const parent = await insertTask({
      projectId: project.id,
      columnId: columns.todo.id,
    });
    const child = await insertTask({
      projectId: project.id,
      columnId: columns.todo.id,
    });

    mockAuthenticatedSession(viewer.user);
    const { app } = createApp();

    const response = await reparent(app)(child.id, parent.id);
    expect(response.status).toBe(403);

    expect((await readTask(child.id)).parentId).toBeNull();
  });

  it("keeps a task out of reach from another workspace", async () => {
    const owner = await createWorkspaceMember({ role: "admin" });
    const stranger = await createWorkspaceMember({ role: "admin" });
    const { project, columns } = await createProjectFixture({
      workspaceId: owner.workspace.id,
    });

    const parent = await insertTask({
      projectId: project.id,
      columnId: columns.todo.id,
    });
    const child = await insertTask({
      projectId: project.id,
      columnId: columns.todo.id,
    });

    mockAuthenticatedSession(stranger.user);
    const { app } = createApp();

    const response = await reparent(app)(child.id, parent.id);
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect((await readTask(child.id)).parentId).toBeNull();
  });
});
