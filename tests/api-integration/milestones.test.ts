import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import db, { schema } from "../../apps/api/src/database";
import { settleEvents } from "../../apps/api/src/events";
import { createApp } from "../../apps/api/src/index";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";

type Task = {
  id: string;
  startDate: string | null;
  dueDate: string | null;
  estimate: number | null;
  isMilestone: boolean;
};

const DAY_15 = "2026-10-15T00:00:00.000Z";
const DAY_20 = "2026-10-20T00:00:00.000Z";

async function setup() {
  const ana = await createWorkspaceMember({ userName: "Ana" });
  const { project } = await createProjectFixture({
    workspaceId: ana.workspace.id,
  });
  mockAuthenticatedSession(ana.user);
  const app = createApp().app;

  const send = async (method: string, path: string, body?: unknown) =>
    app.request(path, {
      method,
      headers: { "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });

  const ok = async <T = Task>(pending: Response | Promise<Response>) => {
    const response = await pending;
    if (response.status !== 200) {
      throw new Error(`${response.status} ${await response.text()}`);
    }
    return response.json() as Promise<T>;
  };

  const create = (extra: Record<string, unknown> = {}) =>
    ok(
      send("POST", `/api/task/${project.id}`, {
        title: "Boletín eléctrico",
        description: "",
        priority: "medium",
        status: "to-do",
        ...extra,
      }),
    );

  return { ana, project, send, ok, create };
}

async function row(id: string) {
  const [task] = await db
    .select()
    .from(schema.taskTable)
    .where(eq(schema.taskTable.id, id));
  return task;
}

describe("API integration: milestones (ADR 082)", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  it("is born with a single date and no estimate", async () => {
    const { create } = await setup();
    const task = await create({
      isMilestone: true,
      startDate: DAY_15,
      dueDate: DAY_20,
      estimate: 3600,
    });

    const stored = await row(task.id);
    expect(stored?.isMilestone).toBe(true);
    expect(stored?.startDate?.toISOString()).toBe(DAY_20);
    expect(stored?.dueDate?.toISOString()).toBe(DAY_20);
    expect(stored?.estimate).toBeNull();
  });

  it("marking keeps the end date, drops the estimate and leaves a trace", async () => {
    const { send, ok, create } = await setup();
    const task = await create({ startDate: DAY_15, dueDate: DAY_20 });
    await ok(send("PUT", `/api/task/estimate/${task.id}`, { estimate: 7200 }));

    const marked = await ok(
      send("PUT", `/api/task/milestone/${task.id}`, { isMilestone: true }),
    );
    expect(marked.isMilestone).toBe(true);
    const stored = await row(task.id);
    expect(stored?.startDate?.toISOString()).toBe(DAY_20);
    expect(stored?.estimate).toBeNull();

    await settleEvents();
    const activity = await db
      .select()
      .from(schema.activityTable)
      .where(
        and(
          eq(schema.activityTable.taskId, task.id),
          eq(schema.activityTable.type, "milestone_changed"),
        ),
      );
    expect(activity.map((entry) => entry.eventData)).toEqual([
      { isMilestone: true },
    ]);
  });

  it("refuses subtasks, both ways", async () => {
    const { send, create } = await setup();
    const parent = await create();
    await create({ parentId: parent.id });

    const withChildren = await send("PUT", `/api/task/milestone/${parent.id}`, {
      isMilestone: true,
    });
    expect(withChildren.status).toBe(400);

    const milestone = await create({ isMilestone: true, dueDate: DAY_20 });
    const child = await send(
      "POST",
      `/api/task/${(await row(parent.id))?.projectId}`,
      {
        title: "Debajo de un hito",
        description: "",
        priority: "medium",
        status: "to-do",
        parentId: milestone.id,
      },
    );
    expect(child.status).toBe(400);

    const loose = await create();
    const reparent = await send("PUT", `/api/task/parent/${loose.id}`, {
      parentId: milestone.id,
    });
    expect(reparent.status).toBe(400);
  });

  it("takes no estimate and no timer", async () => {
    const { send, create } = await setup();
    const milestone = await create({ isMilestone: true, dueDate: DAY_20 });

    const estimate = await send("PUT", `/api/task/estimate/${milestone.id}`, {
      estimate: 3600,
    });
    expect(estimate.status).toBe(400);

    const timer = await send("POST", "/api/time-entry/start", {
      taskId: milestone.id,
    });
    expect(timer.status).toBe(409);
  });

  it("moves its start with its due date, whichever way it is edited", async () => {
    const { project, send, ok, create } = await setup();
    const milestone = await create({ isMilestone: true, dueDate: DAY_15 });

    await ok(
      send("PUT", `/api/task/due-date/${milestone.id}`, { dueDate: DAY_20 }),
    );
    expect((await row(milestone.id))?.startDate?.toISOString()).toBe(DAY_20);

    // El Gantt manda las dos fechas al arrastrar: vale la del final.
    const current = await row(milestone.id);
    await ok(
      send("PUT", `/api/task/${milestone.id}`, {
        title: current?.title,
        description: "",
        status: "to-do",
        priority: "medium",
        position: 0,
        projectId: project.id,
        startDate: "2026-10-01T00:00:00.000Z",
        dueDate: DAY_15,
      }),
    );
    const moved = await row(milestone.id);
    expect(moved?.startDate?.toISOString()).toBe(DAY_15);
    expect(moved?.dueDate?.toISOString()).toBe(DAY_15);
  });

  it("can be filtered", async () => {
    const { project, send, ok, create } = await setup();
    const milestone = await create({ isMilestone: true, dueDate: DAY_20 });
    await create({ title: "Tarea normal" });

    const filter = JSON.stringify({
      type: "condition",
      field: "milestone",
      operator: "eq",
      value: true,
    });
    const { data: result } = await ok<{
      data: {
        columns: Array<{ tasks: Array<{ id: string; isMilestone: boolean }> }>;
      };
    }>(
      send(
        "GET",
        `/api/task/tasks/${project.id}?filter=${encodeURIComponent(filter)}`,
      ),
    );
    const ids = result.columns.flatMap((column) =>
      column.tasks.map((task) => task.id),
    );
    expect(ids).toEqual([milestone.id]);
  });
});
