import { and, eq } from "drizzle-orm";
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

type App = ReturnType<typeof createApp>["app"];

function asUser(user: typeof schema.userTable.$inferSelect): App {
  mockAuthenticatedSession(user);
  return createApp().app;
}

/** `yyyy-mm-dd` del dia local, el mismo criterio que `serverDayKey`. */
function dayKey(offset = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

async function seedTasks(projectId: string, userId: string, count: number) {
  const tasks: (typeof schema.taskTable.$inferSelect)[] = [];
  for (let index = 0; index < count; index++) {
    const [task] = await db
      .insert(schema.taskTable)
      .values({
        ...taskTreeValues(),
        projectId,
        title: `Tarea ${index + 1}`,
        status: "to-do",
        priority: "medium",
        number: index + 1,
        position: index,
        userId,
      })
      .returning();
    await db
      .insert(schema.taskAssigneeTable)
      .values({ taskId: task.id, userId });
    tasks.push(task);
  }
  return tasks;
}

async function setup(taskCount = 4) {
  const member = await createWorkspaceMember();
  const { project } = await createProjectFixture({
    workspaceId: member.workspace.id,
  });
  const tasks = await seedTasks(project.id, member.user.id, taskCount);
  const app = asUser(member.user);
  const ws = member.workspace.id;

  const plan = (taskId: string, body: Record<string, unknown>) =>
    app.request(`/api/planner/${taskId}?workspaceId=${ws}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  const key = (taskId: string, value: boolean) =>
    app.request(`/api/planner/${taskId}/key?workspaceId=${ws}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: value }),
    });
  const bulk = (body: Record<string, unknown>) =>
    app.request(`/api/planner/bulk?workspaceId=${ws}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

  return { member, project, tasks, app, ws, plan, key, bulk };
}

async function entryOf(taskId: string) {
  const [entry] = await db
    .select()
    .from(schema.personalPlanEntryTable)
    .where(eq(schema.personalPlanEntryTable.taskId, taskId));
  return entry;
}

describe("API integration: key tasks (ADR 053)", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  it("hands out ranks 1-3, refuses a fourth and reuses a freed rank", async () => {
    const { tasks, plan, key } = await setup(4);
    for (const task of tasks) {
      expect((await plan(task.id, { plannedDate: dayKey() })).status).toBe(200);
    }

    const ranks: Array<number | null> = [];
    for (const task of tasks.slice(0, 3)) {
      const response = await key(task.id, true);
      expect(response.status).toBe(200);
      ranks.push(((await response.json()) as { keyRank: number }).keyRank);
    }
    expect(ranks).toEqual([1, 2, 3]);

    expect((await key(tasks[3].id, true)).status).toBe(409);
    expect((await entryOf(tasks[3].id)).keyRank).toBeNull();

    // Marcar dos veces no cambia el puesto.
    expect(await (await key(tasks[1].id, true)).json()).toEqual({ keyRank: 2 });

    expect(await (await key(tasks[1].id, false)).json()).toEqual({
      keyRank: null,
    });
    expect(await (await key(tasks[3].id, true)).json()).toEqual({ keyRank: 2 });
  });

  it("never lets a fourth one in when the marks race", async () => {
    const { tasks, plan, key } = await setup(6);
    for (const task of tasks) {
      await plan(task.id, { plannedDate: dayKey() });
    }

    const statuses = (
      await Promise.all(tasks.map((task) => key(task.id, true)))
    ).map((response) => response.status);

    expect(statuses.filter((status) => status === 200)).toHaveLength(3);
    expect(statuses.filter((status) => status === 409)).toHaveLength(3);
  });

  it("keeps the limit in the database too", async () => {
    const { tasks, plan, key } = await setup(2);
    await plan(tasks[0].id, { plannedDate: dayKey() });
    await plan(tasks[1].id, { plannedDate: dayKey() });
    await key(tasks[0].id, true);

    await expect(
      db
        .update(schema.personalPlanEntryTable)
        .set({ keyRank: 1 })
        .where(eq(schema.personalPlanEntryTable.taskId, tasks[1].id)),
    ).rejects.toThrow();
    await expect(
      db
        .update(schema.personalPlanEntryTable)
        .set({ keyRank: 4 })
        .where(eq(schema.personalPlanEntryTable.taskId, tasks[1].id)),
    ).rejects.toThrow();
  });

  it("clears the rank when the entry moves to another day, by any path", async () => {
    const { tasks, plan, key, bulk } = await setup(3);
    for (const task of tasks) {
      await plan(task.id, { plannedDate: dayKey() });
      await key(task.id, true);
    }

    await plan(tasks[0].id, { plannedDate: dayKey(1) });
    expect((await entryOf(tasks[0].id)).keyRank).toBeNull();

    // Mover la hora en el mismo dia no la toca.
    await plan(tasks[1].id, { plannedDate: dayKey(), startMinute: 600 });
    expect((await entryOf(tasks[1].id)).keyRank).toBe(2);

    await bulk({ taskIds: [tasks[2].id], plannedDate: dayKey(2) });
    expect((await entryOf(tasks[2].id)).keyRank).toBeNull();

    // Y el puesto queda libre en el dia de origen.
    await plan(tasks[0].id, { plannedDate: dayKey() });
    expect(await (await key(tasks[0].id, true)).json()).toEqual({ keyRank: 1 });
  });

  it("only marks what is planned, and only in the caller's workspace", async () => {
    const { tasks, key } = await setup(1);
    expect((await key(tasks[0].id, true)).status).toBe(404);

    const other = await createWorkspaceMember();
    const app = asUser(other.user);
    const response = await app.request(
      `/api/planner/${tasks[0].id}/key?workspaceId=${other.workspace.id}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: true }),
      },
    );
    expect(response.status).toBe(404);
  });

  it("puts key tasks first in Today, by rank", async () => {
    const { tasks, plan, key, app, ws } = await setup(4);
    for (const task of tasks) {
      await plan(task.id, { plannedDate: dayKey() });
    }
    await key(tasks[3].id, true);
    await key(tasks[1].id, true);

    const response = await app.request(`/api/today?workspaceId=${ws}`);
    const body = (await response.json()) as {
      planned: { id: string; keyRank: number | null }[];
    };

    expect(body.planned.map((entry) => [entry.id, entry.keyRank])).toEqual([
      [tasks[3].id, 1],
      [tasks[1].id, 2],
      [tasks[0].id, null],
      [tasks[2].id, null],
    ]);
  });
});

describe("API integration: bulk planning (ADR 053)", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  it("appends in order after what the day already has, keeping anchored times and due dates", async () => {
    const { tasks, plan, bulk } = await setup(4);
    const due = new Date(2026, 11, 1);
    await db
      .update(schema.taskTable)
      .set({ dueDate: due })
      .where(eq(schema.taskTable.id, tasks[2].id));
    await plan(tasks[0].id, { plannedDate: dayKey() });
    await plan(tasks[2].id, { plannedDate: dayKey(-2), startMinute: 540 });

    const response = await bulk({
      taskIds: [tasks[3].id, tasks[2].id, tasks[0].id, tasks[1].id],
      plannedDate: dayKey(),
    });

    expect(response.status).toBe(200);
    // La que ya estaba hoy no cuenta como cambio.
    expect(await response.json()).toEqual({ updated: 3 });

    const positions = await Promise.all(
      [tasks[0], tasks[3], tasks[2], tasks[1]].map(async (task) => {
        const entry = await entryOf(task.id);
        return entry.position;
      }),
    );
    expect(positions).toEqual([0, 1, 2, 3]);
    expect((await entryOf(tasks[2].id)).startMinute).toBe(540);

    const [stored] = await db
      .select()
      .from(schema.taskTable)
      .where(eq(schema.taskTable.id, tasks[2].id));
    expect(stored.dueDate?.getTime()).toBe(due.getTime());
  });

  it("takes tasks out of the plan with a null day", async () => {
    const { tasks, plan, bulk } = await setup(3);
    for (const task of tasks) {
      await plan(task.id, { plannedDate: dayKey() });
    }

    const response = await bulk({
      taskIds: [tasks[0].id, tasks[2].id],
      plannedDate: null,
    });

    expect(await response.json()).toEqual({ updated: 2 });
    expect(await entryOf(tasks[0].id)).toBeUndefined();
    expect(await entryOf(tasks[1].id)).toBeDefined();
    expect(await entryOf(tasks[2].id)).toBeUndefined();
  });

  it("ignores tasks of another workspace", async () => {
    const { bulk } = await setup(1);
    const other = await createWorkspaceMember();
    const { project } = await createProjectFixture({
      workspaceId: other.workspace.id,
    });
    const [foreign] = await seedTasks(project.id, other.user.id, 1);

    const response = await bulk({
      taskIds: [foreign.id],
      plannedDate: dayKey(),
    });

    expect(await response.json()).toEqual({ updated: 0 });
    const entries = await db
      .select()
      .from(schema.personalPlanEntryTable)
      .where(
        and(
          eq(schema.personalPlanEntryTable.taskId, foreign.id),
          eq(schema.personalPlanEntryTable.userId, other.user.id),
        ),
      );
    expect(entries).toHaveLength(0);
    expect(await entryOf(foreign.id)).toBeUndefined();
  });
});

describe("API integration: planner window from a given day (ADR 053)", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  it("starts the window on `from` and keeps «previous» relative to today", async () => {
    const { tasks, plan, app, ws } = await setup(3);
    await plan(tasks[0].id, { plannedDate: dayKey(-1) });
    await plan(tasks[1].id, { plannedDate: dayKey(1) });
    await plan(tasks[2].id, { plannedDate: dayKey(20) });

    const response = await app.request(
      `/api/planner?workspaceId=${ws}&from=${dayKey(14)}&days=15`,
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      entries: { id: string }[];
      previous: { id: string }[];
      capacityByDay: Record<string, number>;
      serverToday: string;
    };

    expect(body.entries.map((entry) => entry.id)).toEqual([tasks[2].id]);
    // Lo de mañana no es "de dias anteriores" por mirar la semana siguiente.
    expect(body.previous.map((entry) => entry.id)).toEqual([tasks[0].id]);
    expect(Object.keys(body.capacityByDay)[0]).toBe(dayKey(14));
    expect(body.serverToday).toBe(dayKey());
  });

  it("rejects a malformed day", async () => {
    const { app, ws } = await setup(0);
    const response = await app.request(
      `/api/planner?workspaceId=${ws}&from=mañana`,
    );
    expect(response.status).toBe(400);
  });
});
