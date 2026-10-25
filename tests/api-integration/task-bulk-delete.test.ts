import { eq, inArray } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import db, { schema } from "../../apps/api/src/database";
import { settleEvents, subscribeToEvent } from "../../apps/api/src/events";
import { createApp } from "../../apps/api/src/index";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import {
  childTreeValues,
  createProjectFixture,
  createWorkspaceMember,
  taskTreeValues,
} from "./helpers/fixtures";

type App = ReturnType<typeof createApp>["app"];

const deletedEvents: Record<string, unknown>[] = [];
let subscribed = false;
let nextNumber = 1;

function asUser(user: typeof schema.userTable.$inferSelect): App {
  mockAuthenticatedSession(user);
  return createApp().app;
}

async function insertTask(
  projectId: string,
  title: string,
  tree: { id: string; parentId: string | null; path: string; depth: number },
  extra: Partial<typeof schema.taskTable.$inferInsert> = {},
) {
  const [task] = await db
    .insert(schema.taskTable)
    .values({
      ...tree,
      projectId,
      title,
      status: "to-do",
      priority: "medium",
      number: nextNumber++,
      position: 0,
      ...extra,
    })
    .returning();
  if (!task) throw new Error("Failed to seed task");
  return task;
}

/** Abuela → madre → hija → nieta. */
async function seedBranch(projectId: string) {
  const grandmother = await insertTask(projectId, "Abuela", taskTreeValues());
  const mother = await insertTask(
    projectId,
    "Madre",
    childTreeValues(grandmother),
  );
  const daughter = await insertTask(projectId, "Hija", childTreeValues(mother));
  const granddaughter = await insertTask(
    projectId,
    "Nieta",
    childTreeValues(daughter),
  );
  return { grandmother, mother, daughter, granddaughter };
}

async function tree(ids: string[]) {
  const rows = await db
    .select({
      id: schema.taskTable.id,
      parentId: schema.taskTable.parentId,
      path: schema.taskTable.path,
      depth: schema.taskTable.depth,
    })
    .from(schema.taskTable)
    .where(inArray(schema.taskTable.id, ids));
  return Object.fromEntries(rows.map((row) => [row.id, row]));
}

function bulkDelete(app: App, taskIds: string[]) {
  return app.request("/api/task/bulk", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ taskIds, operation: "delete" }),
  });
}

beforeEach(async () => {
  await resetTestDatabase();
  deletedEvents.length = 0;
  if (!subscribed) {
    subscribed = true;
    subscribeToEvent<Record<string, unknown>>("task.deleted", async (data) => {
      deletedEvents.push(data);
    });
  }
});

describe("PATCH /task/bulk delete (auditoria 1.2)", () => {
  it("promotes the children of a deleted task like the single delete does", async () => {
    const { user, workspace } = await createWorkspaceMember({ role: "owner" });
    const { project } = await createProjectFixture({
      workspaceId: workspace.id,
    });
    const { grandmother, mother, daughter, granddaughter } = await seedBranch(
      project.id,
    );

    const response = await bulkDelete(asUser(user), [mother.id]);
    expect(response.status).toBe(200);

    const after = await tree([grandmother.id, daughter.id, granddaughter.id]);
    expect(after[daughter.id]).toEqual({
      id: daughter.id,
      parentId: grandmother.id,
      path: `/${grandmother.id}/${daughter.id}/`,
      depth: 1,
    });
    expect(after[granddaughter.id]).toEqual({
      id: granddaughter.id,
      parentId: daughter.id,
      path: `/${grandmother.id}/${daughter.id}/${granddaughter.id}/`,
      depth: 2,
    });
  });

  it("keeps the tree whole when a task and its own child go in the same batch", async () => {
    const { user, workspace } = await createWorkspaceMember({ role: "owner" });
    const { project } = await createProjectFixture({
      workspaceId: workspace.id,
    });
    const { grandmother, mother, daughter, granddaughter } = await seedBranch(
      project.id,
    );

    // La hija antes que su madre, para que el orden no salve la prueba.
    const response = await bulkDelete(asUser(user), [daughter.id, mother.id]);
    expect(response.status).toBe(200);

    const after = await tree([grandmother.id, granddaughter.id]);
    expect(after[granddaughter.id]).toEqual({
      id: granddaughter.id,
      parentId: grandmother.id,
      path: `/${grandmother.id}/${granddaughter.id}/`,
      depth: 1,
    });
  });

  it("tells who had the task, as the single delete does", async () => {
    const { user, workspace } = await createWorkspaceMember({ role: "owner" });
    const { project } = await createProjectFixture({
      workspaceId: workspace.id,
    });
    const task = await insertTask(
      project.id,
      "Con asignada",
      taskTreeValues(),
      {
        userId: user.id,
      },
    );
    await db
      .insert(schema.taskAssigneeTable)
      .values({ taskId: task.id, userId: user.id });

    const response = await bulkDelete(asUser(user), [task.id]);
    expect(response.status).toBe(200);
    await settleEvents();

    expect(deletedEvents).toHaveLength(1);
    expect(deletedEvents[0]).toMatchObject({
      taskId: task.id,
      assigneeIds: [user.id],
      teamId: null,
    });
    const [gone] = await db
      .select()
      .from(schema.taskTable)
      .where(eq(schema.taskTable.id, task.id));
    expect(gone).toBeUndefined();
  });
});
