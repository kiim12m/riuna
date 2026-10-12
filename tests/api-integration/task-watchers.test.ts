import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import db, { schema } from "../../apps/api/src/database";
import { settleEvents } from "../../apps/api/src/events";
import { createApp } from "../../apps/api/src/index";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import {
  addWorkspaceMember,
  createProjectFixture,
  createWorkspaceMember,
  taskTreeValues,
} from "./helpers/fixtures";

type User = typeof schema.userTable.$inferSelect;
type Watcher = { userId: string; watching: boolean; assignee: boolean };

let number = 0;

async function task(
  projectId: string,
  { title = "Tarea", assignees = [] as string[], status = "to-do" } = {},
) {
  number += 1;
  const [row] = await db
    .insert(schema.taskTable)
    .values({
      ...taskTreeValues(),
      projectId,
      title,
      status,
      priority: "medium",
      number,
      userId: assignees[0] ?? null,
    })
    .returning();
  if (!row) throw new Error("Failed to seed task");
  for (const userId of assignees) {
    await db
      .insert(schema.taskAssigneeTable)
      .values({ taskId: row.id, userId });
  }
  return row;
}

async function watch(taskId: string, userId: string) {
  await db.insert(schema.taskWatcherTable).values({ taskId, userId });
}

function as(user: User) {
  mockAuthenticatedSession(user);
  return createApp().app;
}

function json(method: string, body: unknown) {
  return {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}

async function watcherIds(taskId: string) {
  const rows = await db
    .select({ userId: schema.taskWatcherTable.userId })
    .from(schema.taskWatcherTable)
    .where(eq(schema.taskWatcherTable.taskId, taskId));
  return rows.map((row) => row.userId).sort();
}

async function notifications(taskId: string, type: string) {
  await settleEvents();
  const rows = await db
    .select({
      userId: schema.notificationTable.userId,
      eventData: schema.notificationTable.eventData,
    })
    .from(schema.notificationTable)
    .where(
      and(
        eq(schema.notificationTable.resourceId, taskId),
        eq(schema.notificationTable.type, type),
      ),
    );
  return rows;
}

const recipients = (rows: { userId: string }[]) =>
  rows.map((row) => row.userId).sort();

async function setup() {
  const ana = await createWorkspaceMember({ userName: "Ana" });
  const ws = ana.workspace.id;
  const luis = await addWorkspaceMember(ws, "member");
  const marta = await addWorkspaceMember(ws, "member");
  const vera = await addWorkspaceMember(ws, "viewer");
  const { project, columns } = await createProjectFixture({ workspaceId: ws });
  return { ana: ana.user, luis, marta, vera, ws, project, columns };
}

describe("API integration: task watchers (ADR 076)", () => {
  beforeEach(async () => {
    await resetTestDatabase();
    number = 0;
  });

  describe("watching and unwatching", () => {
    it("lets anyone who can read the task watch it, even a viewer", async () => {
      const { vera, project } = await setup();
      const row = await task(project.id);

      const response = await as(vera).request(
        `/api/task-watcher/${row.id}`,
        json("POST", {}),
      );

      expect(response.status).toBe(200);
      const body = (await response.json()) as Watcher[];
      expect(body).toEqual([
        expect.objectContaining({
          userId: vera.id,
          watching: true,
          assignee: false,
        }),
      ]);

      const off = await as(vera).request(`/api/task-watcher/${row.id}`, {
        method: "DELETE",
      });
      expect(off.status).toBe(200);
      expect(await watcherIds(row.id)).toEqual([]);
    });

    it("needs task:assign to add or remove someone else", async () => {
      const { luis, marta, vera, project } = await setup();
      const row = await task(project.id);

      const denied = await as(vera).request(
        `/api/task-watcher/${row.id}`,
        json("POST", { userId: marta.id }),
      );
      expect(denied.status).toBe(403);

      const added = await as(luis).request(
        `/api/task-watcher/${row.id}`,
        json("POST", { userId: marta.id }),
      );
      expect(added.status).toBe(200);
      expect(await watcherIds(row.id)).toEqual([marta.id]);

      const removeDenied = await as(vera).request(
        `/api/task-watcher/${row.id}?userId=${marta.id}`,
        { method: "DELETE" },
      );
      expect(removeDenied.status).toBe(403);

      const removed = await as(luis).request(
        `/api/task-watcher/${row.id}?userId=${marta.id}`,
        { method: "DELETE" },
      );
      expect(removed.status).toBe(200);
      expect(await watcherIds(row.id)).toEqual([]);
    });

    it("refuses someone who is not a member of the workspace", async () => {
      const { luis, project } = await setup();
      const outsider = await createWorkspaceMember({ userName: "Fuera" });
      const row = await task(project.id);

      const response = await as(luis).request(
        `/api/task-watcher/${row.id}`,
        json("POST", { userId: outsider.user.id }),
      );

      expect(response.status).toBe(403);
      expect(await watcherIds(row.id)).toEqual([]);
    });

    it("lists assignees as implicit watchers, first, and drops who left", async () => {
      const { ana, luis, marta, ws, project } = await setup();
      const row = await task(project.id, { assignees: [luis.id] });
      await watch(row.id, marta.id);
      await watch(row.id, ana.id);
      await db
        .delete(schema.workspaceUserTable)
        .where(
          and(
            eq(schema.workspaceUserTable.workspaceId, ws),
            eq(schema.workspaceUserTable.userId, marta.id),
          ),
        );

      const response = await as(ana).request(`/api/task-watcher/${row.id}`);
      const body = (await response.json()) as Watcher[];

      expect(
        body.map(({ userId, watching, assignee }) => ({
          userId,
          watching,
          assignee,
        })),
      ).toEqual([
        { userId: luis.id, watching: false, assignee: true },
        { userId: ana.id, watching: true, assignee: false },
      ]);
    });
  });

  describe("watching on its own", () => {
    it("the creator watches a task created through the API", async () => {
      const { ana, luis, project, columns } = await setup();

      const response = await as(ana).request(
        `/api/task/${project.id}`,
        json("POST", {
          title: "Pedir material",
          description: "",
          priority: "medium",
          status: columns.todo.slug,
          userId: luis.id,
        }),
      );
      expect(response.status).toBe(200);
      const created = (await response.json()) as { id: string };

      expect(await watcherIds(created.id)).toEqual([ana.id]);
    });

    it("commenting and being mentioned make you watch; existing tasks are not backfilled", async () => {
      const { ana, luis, marta, project } = await setup();
      const row = await task(project.id);
      expect(await watcherIds(row.id)).toEqual([]);

      const response = await as(luis).request(
        `/api/comment/${row.id}`,
        json("POST", {
          content: `<p>Lo miro con <riuna-mention id="${marta.id}">@Marta</riuna-mention></p>`,
        }),
      );
      expect(response.status).toBe(200);
      await settleEvents();

      expect(await watcherIds(row.id)).toEqual([luis.id, marta.id].sort());
      expect(await watcherIds(row.id)).not.toContain(ana.id);
    });

    it("a mention of someone outside the workspace does not make them watch", async () => {
      const { luis, project } = await setup();
      const outsider = await createWorkspaceMember({ userName: "Fuera" });
      const row = await task(project.id);

      await as(luis).request(
        `/api/comment/${row.id}`,
        json("POST", {
          content: `<riuna-mention id="${outsider.user.id}">@Fuera</riuna-mention>`,
        }),
      );
      await settleEvents();

      expect(await watcherIds(row.id)).toEqual([luis.id]);
    });
  });

  describe("who gets notified", () => {
    it("a comment reaches every assignee and every watcher, but not its author", async () => {
      const { ana, luis, marta, vera, project } = await setup();
      const row = await task(project.id, { assignees: [luis.id, marta.id] });
      await watch(row.id, vera.id);

      await as(ana).request(
        `/api/comment/${row.id}`,
        json("POST", { content: "<p>¿Cómo va?</p>" }),
      );

      const rows = await notifications(row.id, "task_comment");
      expect(recipients(rows)).toEqual([luis.id, marta.id, vera.id].sort());
      const toVera = rows.find((n) => n.userId === vera.id);
      expect(toVera?.eventData).toMatchObject({ reason: "watcher" });
      const toLuis = rows.find((n) => n.userId === luis.id);
      expect(toLuis?.eventData).toMatchObject({ reason: "assignee" });
    });

    it("an imported comment neither notifies nor makes anyone watch", async () => {
      const { ana, luis, marta, project } = await setup();
      const row = await task(project.id, { assignees: [luis.id] });
      await watch(row.id, marta.id);

      const response = await as(ana).request(
        `/api/comment/${row.id}`,
        json("POST", {
          content: "<p>Comentario de PLANKA</p>",
          externalUserName: "Pepe",
          externalSource: "planka",
        }),
      );
      expect(response.status).toBe(200);

      expect(await notifications(row.id, "task_comment")).toEqual([]);
      expect(await watcherIds(row.id)).toEqual([marta.id]);
    });

    it("someone mentioned gets the mention and not also the comment", async () => {
      const { ana, luis, project } = await setup();
      const row = await task(project.id, { assignees: [luis.id] });

      await as(ana).request(
        `/api/comment/${row.id}`,
        json("POST", {
          content: `<riuna-mention id="${luis.id}">@Luis</riuna-mention> mira esto`,
        }),
      );

      expect(await notifications(row.id, "task_comment")).toEqual([]);
      expect(recipients(await notifications(row.id, "task_mention"))).toEqual([
        luis.id,
      ]);
    });

    it("a status change reaches assignees and watchers, not who made it", async () => {
      const { ana, luis, marta, project, columns } = await setup();
      const row = await task(project.id, { assignees: [luis.id] });
      await watch(row.id, marta.id);
      await watch(row.id, ana.id);

      const response = await as(ana).request(
        `/api/task/status/${row.id}`,
        json("PUT", { status: columns.done.slug }),
      );
      expect(response.status).toBe(200);

      expect(
        recipients(await notifications(row.id, "task_status_changed")),
      ).toEqual([luis.id, marta.id].sort());
    });

    it("what a cascade drags along does not notify", async () => {
      const { ana, marta, project, columns } = await setup();
      await db
        .update(schema.projectTable)
        .set({ cascadeClose: true })
        .where(eq(schema.projectTable.id, project.id));
      const parent = await task(project.id, { title: "Madre" });
      number += 1;
      const [child] = await db
        .insert(schema.taskTable)
        .values({
          ...taskTreeValues(),
          id: `child-${parent.id}`,
          path: `${parent.path}child-${parent.id}/`,
          depth: 1,
          parentId: parent.id,
          projectId: project.id,
          title: "Hija",
          status: "to-do",
          priority: "medium",
          number,
        })
        .returning();
      if (!child) throw new Error("Failed to seed child");
      await watch(child.id, marta.id);

      await as(ana).request(
        `/api/task/status/${parent.id}`,
        json("PUT", { status: columns.done.slug }),
      );

      expect(await notifications(child.id, "task_status_changed")).toEqual([]);
    });

    it("a due date change notifies, from the dedicated route and from the full update", async () => {
      const { ana, luis, marta, project, columns } = await setup();
      const row = await task(project.id, { assignees: [luis.id] });
      await watch(row.id, marta.id);

      await as(ana).request(
        `/api/task/due-date/${row.id}`,
        json("PUT", { dueDate: "2026-10-30" }),
      );
      const first = await notifications(row.id, "task_due_date_changed");
      expect(recipients(first)).toEqual([luis.id, marta.id].sort());
      expect(first[0]?.eventData).toMatchObject({
        newDueDate: expect.any(String),
      });

      const full = await as(ana).request(
        `/api/task/${row.id}`,
        json("PUT", {
          title: row.title,
          description: "",
          status: columns.todo.slug,
          priority: "medium",
          position: 0,
          projectId: project.id,
          userId: luis.id,
          dueDate: "2026-11-03",
        }),
      );
      expect(full.status).toBe(200);

      expect(await notifications(row.id, "task_due_date_changed")).toHaveLength(
        4,
      );
    });

    it("someone who left the workspace is not notified any more", async () => {
      const { ana, marta, ws, project, columns } = await setup();
      const row = await task(project.id);
      await watch(row.id, marta.id);
      await db
        .delete(schema.workspaceUserTable)
        .where(
          and(
            eq(schema.workspaceUserTable.workspaceId, ws),
            eq(schema.workspaceUserTable.userId, marta.id),
          ),
        );

      await as(ana).request(
        `/api/task/status/${row.id}`,
        json("PUT", { status: columns.done.slug }),
      );

      expect(await notifications(row.id, "task_status_changed")).toEqual([]);
    });
  });

  describe("where watched tasks show up", () => {
    it("«Observando» lists what I watch, open and not assigned to me", async () => {
      const { ana, luis, ws, project, columns } = await setup();
      const watched = await task(project.id, {
        title: "La sigo",
        assignees: [luis.id],
      });
      const mine = await task(project.id, {
        title: "Mía y la observo",
        assignees: [ana.id],
      });
      const closed = await task(project.id, { title: "Cerrada" });
      const notWatched = await task(project.id, { title: "No la sigo" });
      await watch(watched.id, ana.id);
      await watch(mine.id, ana.id);
      await watch(closed.id, ana.id);
      await db
        .update(schema.taskTable)
        .set({ status: "done", columnId: columns.done.id })
        .where(eq(schema.taskTable.id, closed.id));

      const response = await as(ana).request(
        `/api/my-work/watching?workspaceId=${ws}`,
      );
      expect(response.status).toBe(200);
      const body = (await response.json()) as { tasks: { id: string }[] };

      expect(body.tasks.map((t) => t.id)).toEqual([watched.id]);
      expect(body.tasks.map((t) => t.id)).not.toContain(notWatched.id);
    });

    it("filters a view by who watches", async () => {
      const { ana, luis, project } = await setup();
      const watched = await task(project.id, { title: "Observada" });
      await task(project.id, { title: "Sin observar" });
      await watch(watched.id, luis.id);

      const filter = encodeURIComponent(
        JSON.stringify({
          type: "condition",
          field: "watchers",
          operator: "eq",
          value: luis.id,
        }),
      );
      const response = await as(ana).request(
        `/api/task/tasks/${project.id}?filter=${filter}`,
      );
      expect(response.status).toBe(200);
      const body = await response.json();
      const titles = [
        ...body.data.columns.flatMap(
          (column: { tasks: Array<{ title: string }> }) => column.tasks,
        ),
        ...body.data.plannedTasks,
      ].map((t: { title: string }) => t.title);

      expect(titles).toEqual(["Observada"]);
    });
  });
});
