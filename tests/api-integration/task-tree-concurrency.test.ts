import { inArray } from "drizzle-orm";
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
 * Las dos CHECK de la base garantizan que cada fila es coherente consigo misma
 * —`path` acaba en su id, `depth` cuadra con `path`—, pero no que el bosque lo
 * sea. Estas pruebas atacan lo segundo, que es lo que el cerrojo por proyecto
 * de `lockProjectTree` protege.
 *
 * Sin el cerrojo, las dos fallan: la primera deja un ciclo `A -> B -> A` con
 * las dos CHECK satisfechas, y la segunda deja `parent_id` y `path` apuntando a
 * sitios distintos.
 */

type Task = typeof schema.taskTable.$inferSelect;

async function insertTask(
  projectId: string,
  columnId: string,
  number: number,
  tree: { id: string; parentId: string | null; path: string; depth: number },
) {
  const [task] = await db
    .insert(schema.taskTable)
    .values({
      ...tree,
      projectId,
      columnId,
      number,
      title: `Tarea ${number}`,
      status: "to-do",
      priority: "medium",
      position: number,
    })
    .returning();

  return task;
}

async function readTasks(ids: string[]): Promise<Map<string, Task>> {
  const rows = await db
    .select()
    .from(schema.taskTable)
    .where(inArray(schema.taskTable.id, ids));

  return new Map(rows.map((row) => [row.id, row]));
}

function reparent(
  app: ReturnType<typeof createApp>["app"],
  taskId: string,
  parentId: string | null,
) {
  return app.request(`/api/task/parent/${taskId}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ parentId }),
  });
}

/** Cierto si alguna cadena de `parent_id` se muerde la cola. */
function hasCycle(tasks: Map<string, Task>) {
  for (const start of tasks.keys()) {
    const seen = new Set<string>();
    let cursor: string | null = start;

    while (cursor) {
      if (seen.has(cursor)) return true;
      seen.add(cursor);
      cursor = tasks.get(cursor)?.parentId ?? null;
    }
  }

  return false;
}

describe("API integration: concurrent task tree writes", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  it("never lets two crossing reparents build a cycle", async () => {
    const member = await createWorkspaceMember({ role: "admin" });
    const { project, columns } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });

    const a = await insertTask(
      project.id,
      columns.todo.id,
      1,
      taskTreeValues(),
    );
    const b = await insertTask(
      project.id,
      columns.todo.id,
      2,
      taskTreeValues(),
    );

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    // A bajo B y B bajo A, a la vez. Una de las dos debe perder.
    const [first, second] = await Promise.all([
      reparent(app, a.id, b.id),
      reparent(app, b.id, a.id),
    ]);

    const statuses = [first.status, second.status].sort();
    expect(statuses[0]).toBe(200);
    // La perdedora se rechaza por ciclo (400), nunca se acepta en silencio.
    expect(statuses[1]).not.toBe(200);

    const tasks = await readTasks([a.id, b.id]);
    expect(hasCycle(tasks)).toBe(false);

    // Y exactamente una sigue siendo raiz.
    const roots = [...tasks.values()].filter((task) => task.parentId === null);
    expect(roots).toHaveLength(1);
  });

  it("keeps path and parent_id telling the same story when a branch moves under a reparent", async () => {
    const member = await createWorkspaceMember({ role: "admin" });
    const { project, columns } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });

    // A raiz con hija C; B raiz aparte.
    const a = await insertTask(
      project.id,
      columns.todo.id,
      1,
      taskTreeValues(),
    );
    const b = await insertTask(
      project.id,
      columns.todo.id,
      2,
      taskTreeValues(),
    );
    const c = await insertTask(
      project.id,
      columns.todo.id,
      3,
      childTreeValues(a),
    );

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    // Mover A bajo B mientras C se promueve a raiz.
    const [first, second] = await Promise.all([
      reparent(app, a.id, b.id),
      reparent(app, c.id, null),
    ]);

    expect([first.status, second.status].every((status) => status < 500)).toBe(
      true,
    );

    const tasks = await readTasks([a.id, b.id, c.id]);

    // La invariante: el `path` de cada tarea es el de su padre mas su id, y su
    // `depth` es el del padre mas uno. Si divergen, la tarea sale en un sitio
    // en la lista y cuenta en el agregado de otro.
    for (const task of tasks.values()) {
      if (task.parentId === null) {
        expect(task.path).toBe(`/${task.id}/`);
        expect(task.depth).toBe(0);
        continue;
      }

      const parent = tasks.get(task.parentId);
      expect(parent).toBeDefined();
      expect(task.path).toBe(`${parent?.path}${task.id}/`);
      expect(task.depth).toBe((parent?.depth ?? 0) + 1);
    }
  });
});
