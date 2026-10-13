import { readFileSync } from "node:fs";
import { and, eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import db, { schema } from "../../apps/api/src/database";
import { settleEvents } from "../../apps/api/src/events";
import { createApp } from "../../apps/api/src/index";
import { serverDayKey } from "../../apps/api/src/utils/day-boundaries";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import {
  childTreeValues,
  createProjectFixture,
  createWorkspaceMember,
  taskTreeValues,
} from "./helpers/fixtures";

// Octubre de 2026; el lunes 12 se siembra como festivo del espacio.
const day = (date: number) => new Date(2026, 9, date);
const iso = (date: number) => day(date).toISOString();

async function setup() {
  const ana = await createWorkspaceMember({ userName: "Ana", role: "admin" });
  const { project, columns } = await createProjectFixture({
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
  const create = (extra: Record<string, unknown> = {}) =>
    ok(
      send("POST", `/api/task/${project.id}`, {
        title: "Tarea",
        description: "",
        priority: "medium",
        status: "to-do",
        ...extra,
      }),
    );

  return { ana, project, columns, send, ok, create };
}

async function row(id: string) {
  const [task] = await db
    .select()
    .from(schema.taskTable)
    .where(eq(schema.taskTable.id, id));
  if (!task) throw new Error(`No task ${id}`);
  return task;
}

const keyOf = (date: Date | null) => (date ? serverDayKey(date) : null);

describe("API integration: summary tasks (ADR 083)", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  it("a parent without dates turns automatic and follows its branch", async () => {
    const { send, ok, create } = await setup();
    const fase = await create({ title: "Fase 1" });
    const zanja = await create({
      title: "Zanja",
      parentId: fase.id,
      startDate: iso(5),
      dueDate: iso(9),
    });

    let parent = await row(fase.id);
    expect(parent.autoDates).toBe(true);
    expect(keyOf(parent.startDate)).toBe("2026-10-05");
    expect(keyOf(parent.dueDate)).toBe("2026-10-09");

    await ok(
      send("PUT", `/api/task/due-date/${zanja.id}`, { dueDate: iso(16) }),
    );
    parent = await row(fase.id);
    expect(keyOf(parent.dueDate)).toBe("2026-10-16");

    // Sus fechas ya no se editan a mano.
    const manual = await send("PUT", `/api/task/due-date/${fase.id}`, {
      dueDate: iso(30),
    });
    expect(manual.status).toBe(409);
  });

  it("shrinks when a subtask is archived or moved out", async () => {
    const { send, ok, create } = await setup();
    const fase = await create({ title: "Fase 1" });
    await create({ parentId: fase.id, startDate: iso(5), dueDate: iso(7) });
    const tarde = await create({
      parentId: fase.id,
      startDate: iso(14),
      dueDate: iso(20),
    });
    const fuera = await create({
      parentId: fase.id,
      startDate: iso(1),
      dueDate: iso(2),
    });
    expect(keyOf((await row(fase.id)).startDate)).toBe("2026-10-01");

    await ok(
      send("PUT", `/api/task/status/${tarde.id}`, { status: "archived" }),
    );
    expect(keyOf((await row(fase.id)).dueDate)).toBe("2026-10-07");

    await ok(send("PUT", `/api/task/parent/${fuera.id}`, { parentId: null }));
    expect(keyOf((await row(fase.id)).startDate)).toBe("2026-10-05");
  });

  it("warns when the subtasks end after a parent with its own dates", async () => {
    const { send, ok, create } = await setup();
    const fase = await create({
      title: "Fase 2",
      startDate: iso(5),
      dueDate: iso(9),
    });
    await create({ parentId: fase.id, startDate: iso(8), dueDate: iso(14) });

    const detail = await ok<{
      autoDates: boolean;
      schedule: { overflowWorkDays: number; branchDueDate: string } | null;
    }>(send("GET", `/api/task/${fase.id}`));
    expect(detail.autoDates).toBe(false);
    // Del viernes 9 al miercoles 14: el lunes 12 es festivo, quedan 13 y 14.
    expect(detail.schedule?.overflowWorkDays).toBe(2);

    await ok(
      send("PUT", `/api/task/auto-dates/${fase.id}`, { autoDates: true }),
    );
    const parent = await row(fase.id);
    expect(keyOf(parent.startDate)).toBe("2026-10-08");
    expect(keyOf(parent.dueDate)).toBe("2026-10-14");
    const after = await ok<{ schedule: unknown }>(
      send("GET", `/api/task/${fase.id}`),
    );
    expect(after.schedule).toBeNull();
  });

  it("moves a whole branch the same working days, quietly", async () => {
    const { send, ok, create } = await setup();
    const fase = await create({ title: "Fase 1" });
    const a = await create({
      parentId: fase.id,
      startDate: iso(8),
      dueDate: iso(9),
    });
    const b = await create({
      parentId: fase.id,
      startDate: iso(13),
      dueDate: iso(14),
    });

    const result = await ok<{ moved: number }>(
      send("POST", `/api/task/shift-branch/${fase.id}`, { workDays: 1 }),
    );
    expect(result.moved).toBe(3);
    // El viernes 9 mas un laborable es el martes 13: el lunes es festivo.
    expect(keyOf((await row(a.id)).startDate)).toBe("2026-10-09");
    expect(keyOf((await row(a.id)).dueDate)).toBe("2026-10-13");
    expect(keyOf((await row(b.id)).dueDate)).toBe("2026-10-15");
    expect(keyOf((await row(fase.id)).dueDate)).toBe("2026-10-15");

    // Lo que hace el Gantt: soltar la rama para que empiece otro dia.
    await ok(
      send("POST", `/api/task/shift-branch/${fase.id}`, { startDate: iso(16) }),
    );
    expect(keyOf((await row(a.id)).startDate)).toBe("2026-10-16");

    await settleEvents();
    const activity = await db
      .select()
      .from(schema.activityTable)
      .where(
        and(
          eq(schema.activityTable.taskId, fase.id),
          eq(schema.activityTable.type, "branch_shifted"),
        ),
      );
    expect(activity).toHaveLength(2);
    // Mover la rama no avisa a nadie de cada vencimiento movido.
    const notices = await db
      .select()
      .from(schema.notificationTable)
      .where(eq(schema.notificationTable.type, "task_due_date_changed"));
    expect(notices).toEqual([]);
  });

  it("weighs a branch's progress by the estimates when the project asks", async () => {
    const { project, columns, send, ok, create } = await setup();
    const fase = await create({ title: "Fase" });
    const big = await create({ parentId: fase.id, estimate: 6 * 3600 });
    await create({ parentId: fase.id, estimate: 2 * 3600 });
    // Sin estimar: pesa la media, 4 h. Un hito no pesa.
    await create({ parentId: fase.id });
    await create({ parentId: fase.id, isMilestone: true });
    await ok(
      send("PUT", `/api/task/status/${big.id}`, { status: columns.done.slug }),
    );

    const progressOf = async () =>
      (
        await ok<{ subtree: { progress: number } }>(
          send("GET", `/api/task/${fase.id}`),
        )
      ).subtree.progress;

    // Contando tareas: 1 de 4.
    expect(await progressOf()).toBe(25);
    await ok(
      send("PATCH", `/api/project/${project.id}/tree-settings`, {
        weightedProgress: true,
      }),
    );
    // 6 h de 6 + 2 + 4.
    expect(await progressOf()).toBe(50);
  });

  it("the 0088 data step makes dateless parents automatic with their branch dates", async () => {
    const { project } = await setup();
    const parentTree = taskTreeValues();
    const [parent] = await db
      .insert(schema.taskTable)
      .values({
        ...parentTree,
        projectId: project.id,
        title: "Padre",
        status: "to-do",
        number: 900,
      })
      .returning();
    if (!parent) throw new Error("seed");
    const childTree = childTreeValues(parent);
    const [child] = await db
      .insert(schema.taskTable)
      .values({
        ...childTree,
        projectId: project.id,
        title: "Hija",
        status: "to-do",
        number: 901,
        startDate: day(5),
        dueDate: day(9),
      })
      .returning();
    if (!child) throw new Error("seed");
    await db.insert(schema.taskTable).values({
      ...childTreeValues(child),
      projectId: project.id,
      title: "Nieta",
      status: "to-do",
      number: 902,
      startDate: day(14),
      dueDate: day(20),
    });

    const migration = readFileSync(
      new URL("../../apps/api/drizzle/0088_summary_tasks.sql", import.meta.url),
      "utf8",
    );
    const updates = migration
      .split("--> statement-breakpoint")
      .filter((statement) => statement.includes("UPDATE"));
    expect(updates).toHaveLength(2);
    for (const statement of updates) await db.execute(sql.raw(statement));

    const migrated = await row(parent.id);
    expect(migrated.autoDates).toBe(true);
    expect(keyOf(migrated.startDate)).toBe("2026-10-05");
    expect(keyOf(migrated.dueDate)).toBe("2026-10-20");
    // La hija tenia fechas propias: no cambia.
    expect((await row(child.id)).autoDates).toBe(false);
  });
});
