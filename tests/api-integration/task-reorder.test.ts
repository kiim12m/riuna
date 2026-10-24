import { and, asc, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import db, { schema } from "../../apps/api/src/database";
import { settleEvents, subscribeToEvent } from "../../apps/api/src/events";
import { createApp } from "../../apps/api/src/index";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import {
  addWorkspaceMember,
  createProjectFixture,
  createWorkspaceMember,
  taskTreeValues,
} from "./helpers/fixtures";

type App = ReturnType<typeof createApp>["app"];

const recordedEvents: { type: string; data: Record<string, unknown> }[] = [];
let subscribersInitialized = false;

function initEventSubscribers() {
  if (subscribersInitialized) return;
  subscribersInitialized = true;
  for (const type of ["task.updated", "task.status_changed"]) {
    subscribeToEvent<Record<string, unknown>>(type, async (data) => {
      recordedEvents.push({ type, data });
    });
  }
}

function asUser(user: typeof schema.userTable.$inferSelect): App {
  mockAuthenticatedSession(user);
  return createApp().app;
}

async function seedColumn(
  projectId: string,
  status: string,
  titles: string[],
  firstNumber = 1,
) {
  const tasks: (typeof schema.taskTable.$inferSelect)[] = [];
  for (const [index, title] of titles.entries()) {
    const [task] = await db
      .insert(schema.taskTable)
      .values({
        ...taskTreeValues(),
        projectId,
        title,
        description: `Descripcion de ${title}`,
        status,
        priority: "medium",
        number: firstNumber + index,
        position: index + 1,
      })
      .returning();
    if (!task) throw new Error("Failed to seed task");
    tasks.push(task);
  }
  return tasks;
}

async function columnTitles(projectId: string, status: string) {
  const rows = await db
    .select({ title: schema.taskTable.title })
    .from(schema.taskTable)
    .where(
      and(
        eq(schema.taskTable.projectId, projectId),
        eq(schema.taskTable.status, status),
      ),
    )
    .orderBy(asc(schema.taskTable.position), asc(schema.taskTable.id));
  return rows.map((row) => row.title);
}

function reorder(
  app: App,
  taskId: string,
  body: { status: string; afterId?: string | null; beforeId?: string | null },
) {
  return app.request(`/api/task/reorder/${taskId}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(async () => {
  await resetTestDatabase();
  recordedEvents.length = 0;
  initEventSubscribers();
});

describe("PUT /task/reorder/:id (auditoria 1.1)", () => {
  it("moves a task within its column without touching the other fields", async () => {
    const { user, workspace } = await createWorkspaceMember({ role: "owner" });
    const { project } = await createProjectFixture({
      workspaceId: workspace.id,
    });
    const [a, b, c] = await seedColumn(project.id, "to-do", ["A", "B", "C"]);
    if (!a || !b || !c) throw new Error("seed");

    // Otra persona edita B mientras el navegador que arrastra tiene la foto
    // vieja: antes, arrastrar C reescribia B entera con esa foto.
    await db
      .update(schema.taskTable)
      .set({ title: "B editada", description: "Nueva" })
      .where(eq(schema.taskTable.id, b.id));

    const response = await reorder(asUser(user), c.id, {
      status: "to-do",
      afterId: null,
      beforeId: a.id,
    });
    expect(response.status).toBe(200);

    expect(await columnTitles(project.id, "to-do")).toEqual([
      "C",
      "A",
      "B editada",
    ]);
    const [edited] = await db
      .select()
      .from(schema.taskTable)
      .where(eq(schema.taskTable.id, b.id));
    expect(edited?.description).toBe("Nueva");
  });

  it("changes the status of the dropped task only, and publishes it once", async () => {
    const { user, workspace } = await createWorkspaceMember({ role: "owner" });
    const { project, columns } = await createProjectFixture({
      workspaceId: workspace.id,
    });
    const [a] = await seedColumn(project.id, "to-do", ["A", "B"]);
    const [x, y] = await seedColumn(project.id, "in-progress", ["X", "Y"], 10);
    if (!a || !x || !y) throw new Error("seed");

    const response = await reorder(asUser(user), a.id, {
      status: "in-progress",
      afterId: x.id,
      beforeId: y.id,
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("in-progress");

    expect(await columnTitles(project.id, "in-progress")).toEqual([
      "X",
      "A",
      "Y",
    ]);
    expect(await columnTitles(project.id, "to-do")).toEqual(["B"]);
    const [moved] = await db
      .select()
      .from(schema.taskTable)
      .where(eq(schema.taskTable.id, a.id));
    expect(moved?.columnId).toBe(columns.inProgress.id);

    await settleEvents();
    expect(recordedEvents.map((event) => event.type).sort()).toEqual([
      "task.status_changed",
      "task.updated",
    ]);
    expect(recordedEvents[0]?.data.taskId).toBe(a.id);
    expect(recordedEvents[1]?.data.taskId).toBe(a.id);
  });

  it("keeps the slot of the tasks a filter hides from the browser", async () => {
    const { user, workspace } = await createWorkspaceMember({ role: "owner" });
    const { project } = await createProjectFixture({
      workspaceId: workspace.id,
    });
    const [a, , c] = await seedColumn(project.id, "to-do", [
      "A",
      "B oculta",
      "C",
      "D oculta",
    ]);
    if (!a || !c) throw new Error("seed");

    // El navegador solo ve A y C, y suelta A detras de C.
    const response = await reorder(asUser(user), a.id, {
      status: "to-do",
      afterId: c.id,
      beforeId: null,
    });
    expect(response.status).toBe(200);

    expect(await columnTitles(project.id, "to-do")).toEqual([
      "B oculta",
      "C",
      "A",
      "D oculta",
    ]);
  });

  it("falls back to the other neighbour, and then to the end, when one has left the column", async () => {
    const { user, workspace } = await createWorkspaceMember({ role: "owner" });
    const { project } = await createProjectFixture({
      workspaceId: workspace.id,
    });
    const [a, b, c] = await seedColumn(project.id, "to-do", ["A", "B", "C"]);
    const [gone] = await seedColumn(project.id, "done", ["Ya no esta"], 10);
    if (!a || !b || !c || !gone) throw new Error("seed");
    const app = asUser(user);

    expect(
      (
        await reorder(app, c.id, {
          status: "to-do",
          afterId: gone.id,
          beforeId: b.id,
        })
      ).status,
    ).toBe(200);
    expect(await columnTitles(project.id, "to-do")).toEqual(["A", "C", "B"]);

    expect(
      (
        await reorder(app, a.id, {
          status: "to-do",
          afterId: gone.id,
          beforeId: "no-existe",
        })
      ).status,
    ).toBe(200);
    expect(await columnTitles(project.id, "to-do")).toEqual(["C", "B", "A"]);
  });

  it("reorders the backlog, which is not a board column", async () => {
    const { user, workspace } = await createWorkspaceMember({ role: "owner" });
    const { project } = await createProjectFixture({
      workspaceId: workspace.id,
    });
    const [a, b] = await seedColumn(project.id, "planned", ["A", "B"]);
    if (!a || !b) throw new Error("seed");

    const response = await reorder(asUser(user), a.id, {
      status: "planned",
      afterId: b.id,
    });
    expect(response.status).toBe(200);
    expect(await columnTitles(project.id, "planned")).toEqual(["B", "A"]);
  });

  it("rejects a status the project does not have", async () => {
    const { user, workspace } = await createWorkspaceMember({ role: "owner" });
    const { project } = await createProjectFixture({
      workspaceId: workspace.id,
    });
    const [a] = await seedColumn(project.id, "to-do", ["A"]);
    if (!a) throw new Error("seed");

    const response = await reorder(asUser(user), a.id, { status: "no-existe" });
    expect(response.status).toBe(400);
  });

  it("requires permission to update tasks in the task's workspace", async () => {
    const { workspace } = await createWorkspaceMember({ role: "owner" });
    const { project } = await createProjectFixture({
      workspaceId: workspace.id,
    });
    const [a, b] = await seedColumn(project.id, "to-do", ["A", "B"]);
    if (!a || !b) throw new Error("seed");

    const viewer = await addWorkspaceMember(workspace.id, "viewer");
    const outsider = await createWorkspaceMember({ role: "owner" });

    for (const user of [viewer, outsider.user]) {
      const response = await reorder(asUser(user), b.id, {
        status: "to-do",
        beforeId: a.id,
      });
      expect([403, 404]).toContain(response.status);
    }
    expect(await columnTitles(project.id, "to-do")).toEqual(["A", "B"]);
  });
});
