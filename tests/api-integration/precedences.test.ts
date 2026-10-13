import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import db, { schema } from "../../apps/api/src/database";
import { settleEvents } from "../../apps/api/src/events";
import { createApp } from "../../apps/api/src/index";
import { serverDayKey } from "../../apps/api/src/utils/day-boundaries";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";

// Octubre de 2026; el lunes 12 es festivo del espacio.
const day = (date: number) => new Date(2026, 9, date);
const iso = (date: number) => day(date).toISOString();
const keyOf = (date: Date | null) => (date ? serverDayKey(date) : null);

async function setup() {
  const ana = await createWorkspaceMember({ userName: "Ana", role: "admin" });
  const { project } = await createProjectFixture({
    workspaceId: ana.workspace.id,
  });
  const { project: other } = await createProjectFixture({
    workspaceId: ana.workspace.id,
  });
  await db.insert(schema.workspaceHolidayTable).values({
    workspaceId: ana.workspace.id,
    day: day(12),
    name: "Hispanidad",
  });
  mockAuthenticatedSession(ana.user);
  const app = createApp().app;

  const send = (method: string, path: string, body?: unknown) =>
    app.request(path, {
      method,
      headers: { "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  const ok = async <T = { id: string }>(pending: Promise<Response>) => {
    const response = await pending;
    if (response.status !== 200) {
      throw new Error(`${response.status} ${await response.text()}`);
    }
    return response.json() as Promise<T>;
  };
  const create = (
    extra: Record<string, unknown> = {},
    projectId = project.id,
  ) =>
    ok(
      send("POST", `/api/task/${projectId}`, {
        title: "Tarea",
        description: "",
        priority: "medium",
        status: "to-do",
        ...extra,
      }),
    );
  const precede = (source: string, target: string, lag?: number) =>
    send("POST", "/api/task-relation", {
      sourceTaskId: source,
      targetTaskId: target,
      relationType: "precedes",
      ...(lag === undefined ? {} : { lag }),
    });

  return { ana, project, other, send, ok, create, precede };
}

async function row(id: string) {
  const [task] = await db
    .select()
    .from(schema.taskTable)
    .where(eq(schema.taskTable.id, id));
  if (!task) throw new Error(`No task ${id}`);
  return task;
}

describe("API integration: precedences and automatic scheduling (ADR 084)", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  it("ties the successor to its predecessor, skipping weekends and holidays", async () => {
    const { ok, create, precede } = await setup();
    const solera = await create({ startDate: iso(7), dueDate: iso(9) });
    const cableado = await create({ startDate: iso(19), dueDate: iso(21) });

    const relation = await ok<{ lag: number | null }>(
      precede(solera.id, cableado.id),
    );
    expect(relation.lag).toBe(0);

    const successor = await row(cableado.id);
    expect(successor.autoDates).toBe(true);
    expect(keyOf(successor.startDate)).toBe("2026-10-13");
    expect(keyOf(successor.dueDate)).toBe("2026-10-15");

    await settleEvents();
    const activity = await db
      .select()
      .from(schema.activityTable)
      .where(
        and(
          eq(schema.activityTable.taskId, cableado.id),
          eq(schema.activityTable.type, "precedence_changed"),
        ),
      );
    expect(activity.map((entry) => entry.eventData)).toEqual([
      { predecessorId: solera.id, action: "added", lag: 0 },
    ]);
  });

  it("moves the successors when the predecessor moves, both ways, quietly", async () => {
    const { send, ok, create, precede } = await setup();
    const a = await create({ startDate: iso(5), dueDate: iso(6) });
    const b = await create({ startDate: iso(1), dueDate: iso(2) });
    const c = await create({ isMilestone: true, dueDate: iso(1) });
    await ok(precede(a.id, b.id));
    await ok(precede(b.id, c.id, 1));

    await ok(send("PUT", `/api/task/due-date/${a.id}`, { dueDate: iso(14) }));
    expect(keyOf((await row(b.id)).startDate)).toBe("2026-10-15");
    // El hito: un laborable de desfase despues del fin de b (viernes 16).
    expect(keyOf((await row(c.id)).dueDate)).toBe("2026-10-20");

    await ok(send("PUT", `/api/task/due-date/${a.id}`, { dueDate: iso(6) }));
    expect(keyOf((await row(b.id)).startDate)).toBe("2026-10-07");

    await settleEvents();
    const notices = await db
      .select()
      .from(schema.notificationTable)
      .where(eq(schema.notificationTable.resourceId, b.id));
    expect(notices).toEqual([]);
  });

  it("changes the lag and lets the successor go when the relation is removed", async () => {
    const { send, ok, create, precede } = await setup();
    const a = await create({ startDate: iso(5), dueDate: iso(9) });
    const b = await create({ startDate: iso(1), dueDate: iso(1) });
    const relation = await ok(precede(a.id, b.id));
    expect(keyOf((await row(b.id)).startDate)).toBe("2026-10-13");

    await ok(
      send("PATCH", `/api/task-relation/${relation.id}/lag`, { lag: -2 }),
    );
    expect(keyOf((await row(b.id)).startDate)).toBe("2026-10-08");

    await ok(send("DELETE", `/api/task-relation/${relation.id}`));
    // Sin predecesora no hay nada a lo que atarse: se queda donde estaba.
    expect(keyOf((await row(b.id)).startDate)).toBe("2026-10-08");
  });

  it("keeps a tied start out of reach of a manual edit, but not its length", async () => {
    const { project, send, ok, create, precede } = await setup();
    const a = await create({ startDate: iso(5), dueDate: iso(9) });
    const b = await create({ startDate: iso(1), dueDate: iso(1) });
    await ok(precede(a.id, b.id));

    const current = await row(b.id);
    await ok(
      send("PUT", `/api/task/${b.id}`, {
        title: current.title,
        description: "",
        status: "to-do",
        priority: "medium",
        position: 0,
        projectId: project.id,
        startDate: iso(1),
        dueDate: iso(15),
      }),
    );
    const edited = await row(b.id);
    expect(keyOf(edited.startDate)).toBe("2026-10-13");
    expect(keyOf(edited.dueDate)).toBe("2026-10-15");
  });

  it("refuses what cannot be scheduled", async () => {
    const { other, create, precede } = await setup();
    const a = await create({ startDate: iso(5), dueDate: iso(9) });
    const b = await create({ startDate: iso(13), dueDate: iso(14) });
    const foreign = await create({ dueDate: iso(9) }, other.id);
    const parent = await create({ startDate: iso(5), dueDate: iso(9) });
    await create({ parentId: parent.id, dueDate: iso(6) });
    const child = await create({ parentId: a.id, dueDate: iso(8) });

    expect((await precede(a.id, foreign.id)).status).toBe(400);
    expect((await precede(b.id, parent.id)).status).toBe(400);
    expect((await precede(a.id, child.id)).status).toBe(400);

    // El ciclo, entre dos tareas sin subtareas.
    const c = await create({ startDate: iso(5), dueDate: iso(6) });
    expect((await precede(b.id, c.id)).status).toBe(200);
    expect((await precede(c.id, b.id)).status).toBe(409);
  });

  it("breaks the precedences that would cross projects when a task moves", async () => {
    const { other, send, ok, create, precede } = await setup();
    const a = await create({ startDate: iso(5), dueDate: iso(9) });
    const b = await create({ startDate: iso(13), dueDate: iso(14) });
    await ok(precede(a.id, b.id));

    await ok(
      send("PUT", `/api/task/move/${b.id}`, { destinationProjectId: other.id }),
    );
    const left = await db
      .select()
      .from(schema.taskRelationTable)
      .where(eq(schema.taskRelationTable.relationType, "precedes"));
    expect(left).toEqual([]);
  });
});
