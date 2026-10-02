import { randomUUID } from "node:crypto";
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

type User = typeof schema.userTable.$inferSelect;

type DayReview = {
  review: {
    blockers: string | null;
    summary: {
      done: number;
      workedSeconds: number;
      moved: number;
      unplanned: number;
    };
  } | null;
  private: {
    impact: number | null;
    energy: number | null;
    note: string | null;
  } | null;
};

function dayKey(offset = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

let number = 0;

async function myTask(projectId: string, userId: string, title: string) {
  number += 1;
  const [task] = await db
    .insert(schema.taskTable)
    .values({
      ...taskTreeValues(),
      projectId,
      title,
      status: "to-do",
      priority: "medium",
      number,
      userId,
    })
    .returning();
  await db.insert(schema.taskAssigneeTable).values({ taskId: task.id, userId });
  return task;
}

function api(user: User, ws: string) {
  mockAuthenticatedSession(user);
  const { app } = createApp();
  return {
    plan: (taskId: string, plannedDate: string) =>
      app.request(`/api/planner/${taskId}?workspaceId=${ws}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plannedDate }),
      }),
    close: (date: string, body: Record<string, unknown>) =>
      app.request(`/api/review/day/${date}?workspaceId=${ws}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    get: async (date: string) => {
      const response = await app.request(
        `/api/review/day/${date}?workspaceId=${ws}`,
      );
      expect(response.status).toBe(200);
      return (await response.json()) as DayReview;
    },
    today: async () => {
      const response = await app.request(`/api/today?workspaceId=${ws}`);
      return (await response.json()) as { dayClosed: boolean };
    },
  };
}

async function entryOf(taskId: string) {
  const [entry] = await db
    .select()
    .from(schema.personalPlanEntryTable)
    .where(eq(schema.personalPlanEntryTable.taskId, taskId));
  return entry;
}

async function setup() {
  const member = await createWorkspaceMember({ userName: "Ana" });
  const { project, columns } = await createProjectFixture({
    workspaceId: member.workspace.id,
  });
  return { member, project, columns, ws: member.workspace.id };
}

describe("API integration: close the day (ADR 054)", () => {
  beforeEach(async () => {
    await resetTestDatabase();
    number = 0;
  });

  it("needs a decision for every pending task and saves nothing without them", async () => {
    const { member, project, ws } = await setup();
    const today = await myTask(project.id, member.user.id, "Hoy");
    const earlier = await myTask(project.id, member.user.id, "De ayer");
    const as = api(member.user, ws);
    await as.plan(today.id, dayKey());
    await as.plan(earlier.id, dayKey(-1));

    const response = await as.close(dayKey(), {
      decisions: [{ taskId: today.id, plannedDate: dayKey(1) }],
    });

    expect(response.status).toBe(400);
    expect(await response.text()).toContain(earlier.id);
    expect((await as.get(dayKey())).review).toBeNull();
    expect((await entryOf(today.id)).plannedDate.getDate()).toBe(
      new Date().getDate(),
    );
  });

  it("moves or drops each pending task and keeps the rating apart", async () => {
    const { member, project, columns, ws } = await setup();
    const move = await myTask(project.id, member.user.id, "A mañana");
    const drop = await myTask(project.id, member.user.id, "Fuera");
    const done = await myTask(project.id, member.user.id, "Hecha");
    const as = api(member.user, ws);
    await as.plan(move.id, dayKey());
    await as.plan(drop.id, dayKey(-2));
    await as.plan(done.id, dayKey());
    await db
      .update(schema.taskTable)
      .set({ status: "done", columnId: columns.done.id })
      .where(eq(schema.taskTable.id, done.id));

    const response = await as.close(dayKey(), {
      decisions: [
        { taskId: move.id, plannedDate: dayKey(1) },
        { taskId: drop.id, plannedDate: null },
      ],
      blockers: "  Esperando el material  ",
      impact: 3,
      energy: 2,
      note: "Mucha interrupción",
    });

    expect(response.status).toBe(200);
    const saved = await as.get(dayKey());
    expect(saved.review).toMatchObject({
      blockers: "Esperando el material",
      summary: { done: 1, moved: 1, unplanned: 1 },
    });
    expect(saved.private).toEqual({
      impact: 3,
      energy: 2,
      note: "Mucha interrupción",
    });

    const moved = await entryOf(move.id);
    expect(moved.plannedDate.getDate()).toBe(
      new Date(`${dayKey(1)}T12:00`).getDate(),
    );
    expect(await entryOf(drop.id)).toBeUndefined();
    expect((await as.today()).dayClosed).toBe(true);
  });

  it("keeps the counts when the day is closed again", async () => {
    const { member, project, ws } = await setup();
    const move = await myTask(project.id, member.user.id, "A mañana");
    const as = api(member.user, ws);
    await as.plan(move.id, dayKey());
    await as.close(dayKey(), {
      decisions: [{ taskId: move.id, plannedDate: dayKey(1) }],
      impact: 2,
    });

    const again = await as.close(dayKey(), {
      decisions: [],
      blockers: "Nada",
      impact: 4,
    });

    expect(again.status).toBe(200);
    const saved = await as.get(dayKey());
    expect(saved.review?.summary.moved).toBe(1);
    expect(saved.review?.blockers).toBe("Nada");
    expect(saved.private?.impact).toBe(4);
  });

  it("refuses to move a pending task to the same day or before, and to close a future day", async () => {
    const { member, project, ws } = await setup();
    const task = await myTask(project.id, member.user.id, "Pendiente");
    const as = api(member.user, ws);
    await as.plan(task.id, dayKey());

    const sameDay = await as.close(dayKey(), {
      decisions: [{ taskId: task.id, plannedDate: dayKey() }],
    });
    const future = await as.close(dayKey(1), { decisions: [] });
    const badRating = await as.close(dayKey(), {
      decisions: [{ taskId: task.id, plannedDate: null }],
      impact: 5,
    });

    expect([sameDay.status, future.status, badRating.status]).toEqual([
      400, 400, 400,
    ]);
    expect((await as.get(dayKey())).review).toBeNull();
  });

  it("is only ever the caller's own: another member and another workspace see nothing", async () => {
    const { member, ws } = await setup();
    const as = api(member.user, ws);
    expect(
      (await as.close(dayKey(), { decisions: [], impact: 1, note: "Mía" }))
        .status,
    ).toBe(200);

    const userId = `user-${randomUUID()}`;
    const [luis] = await db
      .insert(schema.userTable)
      .values({
        id: userId,
        email: `${userId}@example.com`,
        emailVerified: true,
        name: "Luis",
      })
      .returning();
    await db.insert(schema.workspaceUserTable).values({
      workspaceId: ws,
      userId: luis.id,
      role: "member",
      joinedAt: new Date(),
    });
    expect(await api(luis, ws).get(dayKey())).toEqual({
      review: null,
      private: null,
    });

    const elsewhere = await createWorkspaceMember({ user: member.user });
    expect(
      await api(member.user, elsewhere.workspace.id).get(dayKey()),
    ).toEqual({ review: null, private: null });
  });
});
