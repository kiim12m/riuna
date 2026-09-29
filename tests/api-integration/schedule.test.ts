import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { serverDayKey } from "../../apps/api/src/utils/day-boundaries";
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

async function createTask(
  projectId: string,
  columnId: string,
  overrides: Partial<typeof schema.taskTable.$inferInsert> = {},
) {
  const [task] = await db
    .insert(schema.taskTable)
    .values({
      ...taskTreeValues(),
      projectId,
      title: "Tender el tablero",
      status: "to-do",
      columnId,
      priority: "medium",
      number: 1,
      position: 0,
      estimate: 3600,
      ...overrides,
    })
    .returning();

  if (!task) throw new Error("Failed to seed task");
  return task;
}

async function assign(taskId: string, userId: string) {
  await db.insert(schema.taskAssigneeTable).values({ taskId, userId });
}

async function planTask(
  taskId: string,
  workspaceId: string,
  userId: string,
  plannedDate: Date,
  overrides: Partial<typeof schema.personalPlanEntryTable.$inferInsert> = {},
) {
  await db
    .insert(schema.personalPlanEntryTable)
    .values({ workspaceId, userId, taskId, plannedDate, ...overrides });
}

// Manana, no hoy: el reparto de "hoy" arranca en `max(inicio de jornada,
// ahora)` (ADR 041), y forzar assertions de colocacion contra la hora real a
// la que corre la suite las haria fallar fuera de 08:00-18:00 UTC. Manana
// siempre arranca a las 08:00, sea cual sea la hora a la que corre esto.
function tomorrow(): Date {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(0, 0, 0, 0);
  return date;
}

/** Medianoche local, `n` dias desde hoy -`tomorrow()` es `dayOffset(1)`. */
function dayOffset(n: number): Date {
  const date = new Date();
  date.setDate(date.getDate() + n);
  date.setHours(0, 0, 0, 0);
  return date;
}

// `serverDayKey` y no `toISOString().slice(0, 10)`: la API ya usa el dia del
// servidor (hallazgo 3 de la revision), y comparar contra una clave UTC
// divergiria en cuanto la suite corriera con otra zona horaria.
const dateKey = serverDayKey;

function getSchedule(
  app: App,
  workspaceId: string,
  days?: number,
  from?: string,
) {
  const query = [days ? `&days=${days}` : "", from ? `&from=${from}` : ""].join(
    "",
  );
  return app.request(`/api/schedule?workspaceId=${workspaceId}${query}`);
}

function putEntryTime(
  app: App,
  workspaceId: string,
  taskId: string,
  startMinute: number | null,
) {
  return app.request(
    `/api/schedule/entries/${taskId}?workspaceId=${workspaceId}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ startMinute }),
    },
  );
}

function postBlock(
  app: App,
  workspaceId: string,
  body: Record<string, unknown>,
) {
  return app.request(`/api/schedule/blocks?workspaceId=${workspaceId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function deleteBlock(app: App, workspaceId: string, id: string) {
  return app.request(`/api/schedule/blocks/${id}?workspaceId=${workspaceId}`, {
    method: "DELETE",
  });
}

function patchBlock(
  app: App,
  workspaceId: string,
  id: string,
  body: Record<string, unknown>,
) {
  return app.request(`/api/schedule/blocks/${id}?workspaceId=${workspaceId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Anade a quien ya es miembro de un espacio a un segundo, distinto. */
async function addToAnotherWorkspace(userId: string) {
  const other = await createWorkspaceMember({ role: "member" });
  await db.insert(schema.workspaceUserTable).values({
    workspaceId: other.workspace.id,
    userId,
    role: "member",
    joinedAt: new Date(),
  });
  return other.workspace;
}

async function setup(role = "member") {
  const member = await createWorkspaceMember({ role });
  const fixture = await createProjectFixture({
    workspaceId: member.workspace.id,
  });

  return {
    app: asUser(member.user),
    workspaceId: member.workspace.id,
    projectId: fixture.project.id,
    columnId: fixture.columns.todo.id,
    userId: member.user.id,
  };
}

describe("cronograma", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  it("places a planned task inside the work day, starting at 08:00", async () => {
    const { app, workspaceId, projectId, columnId, userId } = await setup();
    const day = tomorrow();
    const task = await createTask(projectId, columnId, { estimate: 1800 });
    await assign(task.id, userId);
    await planTask(task.id, workspaceId, userId, day, { position: 0 });

    const response = await getSchedule(app, workspaceId);
    expect(response.status).toBe(200);
    const body = await response.json();

    const dayLayout = body.days.find(
      (d: { dayDate: string }) => d.dayDate === dateKey(day),
    );
    expect(dayLayout).toBeDefined();
    const flow = dayLayout.segments.find(
      (s: { type: string }) => s.type === "flow",
    );
    expect(flow).toMatchObject({
      taskId: task.id,
      startSecond: 8 * 3600,
      endSecond: 8 * 3600 + 1800,
    });
    expect(flow.task.id).toBe(task.id);
  });

  it("gives a task without an estimate a 30-minute slot, not the 10-minute minimum", async () => {
    const { app, workspaceId, projectId, columnId, userId } = await setup();
    const day = tomorrow();
    const unestimated = await createTask(projectId, columnId, {
      estimate: null,
    });
    const next = await createTask(projectId, columnId, {
      number: 2,
      estimate: 1800,
    });
    await assign(unestimated.id, userId);
    await assign(next.id, userId);
    await planTask(unestimated.id, workspaceId, userId, day, { position: 0 });
    await planTask(next.id, workspaceId, userId, day, { position: 1 });

    const body = await (await getSchedule(app, workspaceId)).json();
    const dayLayout = body.days.find(
      (d: { dayDate: string }) => d.dayDate === dateKey(day),
    );
    const flowParts = dayLayout.segments.filter(
      (s: { type: string }) => s.type === "flow",
    );

    expect(
      flowParts.find((s: { taskId: string }) => s.taskId === unestimated.id),
    ).toMatchObject({ startSecond: 8 * 3600, endSecond: 8 * 3600 + 1800 });
    // El siguiente empieza donde termina el hueco de 30 min de la primera,
    // no a los 10 min que daria el minimo general.
    expect(
      flowParts.find((s: { taskId: string }) => s.taskId === next.id),
    ).toMatchObject({ startSecond: 8 * 3600 + 1800 });
  });

  it("splits a flowing entry around a fixed block that falls inside it", async () => {
    const { app, workspaceId, projectId, columnId, userId } = await setup();
    const day = tomorrow();
    const task = await createTask(projectId, columnId, { estimate: 7200 });
    await assign(task.id, userId);
    await planTask(task.id, workspaceId, userId, day, { position: 0 });

    await postBlock(app, workspaceId, {
      title: "Visita de obra",
      kind: "fixed",
      startMinute: 8 * 60 + 15,
      endMinute: 8 * 60 + 45,
      plannedDate: day.toISOString(),
    });

    const body = await (await getSchedule(app, workspaceId)).json();
    const dayLayout = body.days.find(
      (d: { dayDate: string }) => d.dayDate === dateKey(day),
    );
    const flowParts = dayLayout.segments.filter(
      (s: { type: string }) => s.type === "flow",
    );

    expect(flowParts).toHaveLength(2);
    expect(flowParts[0]).toMatchObject({ startSecond: 8 * 3600, part: 0 });
    expect(flowParts[1]).toMatchObject({ part: 1 });
    expect(
      dayLayout.segments.some((s: { type: string }) => s.type === "block"),
    ).toBe(true);
  });

  it("anchors an entry to a clock time and can free it back to flowing", async () => {
    const { app, workspaceId, projectId, columnId, userId } = await setup();
    const day = tomorrow();
    const task = await createTask(projectId, columnId);
    await assign(task.id, userId);
    await planTask(task.id, workspaceId, userId, day, { position: 0 });

    const pinned = await putEntryTime(app, workspaceId, task.id, 9 * 60);
    expect(pinned.status).toBe(200);

    let body = await (await getSchedule(app, workspaceId)).json();
    let dayLayout = body.days.find(
      (d: { dayDate: string }) => d.dayDate === dateKey(day),
    );
    expect(
      dayLayout.segments.find((s: { type: string }) => s.type === "pinned"),
    ).toMatchObject({ taskId: task.id, startSecond: 9 * 3600 });

    const freed = await putEntryTime(app, workspaceId, task.id, null);
    expect(freed.status).toBe(200);

    body = await (await getSchedule(app, workspaceId)).json();
    dayLayout = body.days.find(
      (d: { dayDate: string }) => d.dayDate === dateKey(day),
    );
    expect(
      dayLayout.segments.some((s: { type: string }) => s.type === "pinned"),
    ).toBe(false);
    expect(
      dayLayout.segments.find((s: { type: string }) => s.type === "flow"),
    ).toMatchObject({ taskId: task.id });
  });

  it("refuses to anchor a task that has no plan entry yet", async () => {
    const { app, workspaceId, projectId, columnId, userId } = await setup();
    const task = await createTask(projectId, columnId);
    await assign(task.id, userId);

    const response = await putEntryTime(app, workspaceId, task.id, 9 * 60);
    expect(response.status).toBe(404);
  });

  it("projects a repeating block across the window without storing a row per day", async () => {
    const { app, workspaceId } = await setup();

    const created = await postBlock(app, workspaceId, {
      title: "Comida",
      kind: "break",
      startMinute: 13 * 60,
      endMinute: 14 * 60,
      cadence: { frequency: "daily", interval: 1 },
    });
    expect(created.status).toBe(200);

    const rows = await db.select().from(schema.scheduleBlockTable);
    expect(rows).toHaveLength(1);

    const body = await (await getSchedule(app, workspaceId, 5)).json();
    const daysWithLunch = body.days.filter((d: { segments: unknown[] }) =>
      d.segments.some(
        (s: { type: string; entries?: { title: string }[] }) =>
          s.type === "block" &&
          s.entries?.some((entry) => entry.title === "Comida"),
      ),
    );
    expect(daysWithLunch).toHaveLength(5);
  });

  it("stops projecting a repeating block once endsAt has passed", async () => {
    const { app, workspaceId } = await setup();

    const created = await postBlock(app, workspaceId, {
      title: "Comida",
      kind: "break",
      startMinute: 13 * 60,
      endMinute: 14 * 60,
      cadence: { frequency: "daily", interval: 1 },
      endsAt: dayOffset(2).toISOString(),
    });
    expect(created.status).toBe(200);

    const body = await (await getSchedule(app, workspaceId, 5)).json();
    const daysWithLunch = body.days.filter((d: { segments: unknown[] }) =>
      d.segments.some(
        (s: { type: string; entries?: { title: string }[] }) =>
          s.type === "block" &&
          s.entries?.some((entry) => entry.title === "Comida"),
      ),
    );
    // Dias 0, 1 y 2 (hoy, manana y pasado manana) tienen el bloque; los dias
    // 3 y 4 de la ventana de 5, no.
    expect(daysWithLunch).toHaveLength(3);
  });

  it("accepts endsAt as a bare yyyy-mm-dd date, like plannedDate does", async () => {
    // La UI (`create-block-dialog.tsx`) manda un `<input type=\"date\">` a
    // secas, sin hora ni zona -lo mismo que ya mandaba `plannedDate`-. Antes
    // de esta correccion, `endsAt` se leia con `validateAndParseDate`
    // (`new Date(str)`, medianoche UTC) en vez de `parseServerDay`
    // (medianoche local), a diferencia de `plannedDate`; las pruebas de
    // arriba no lo pillaban porque siempre mandan `.toISOString()`, un
    // instante completo, no una fecha pelada.
    const { app, workspaceId } = await setup();

    const created = await postBlock(app, workspaceId, {
      title: "Comida",
      kind: "break",
      startMinute: 13 * 60,
      endMinute: 14 * 60,
      cadence: { frequency: "daily", interval: 1 },
      endsAt: dateKey(dayOffset(2)),
    });
    expect(created.status).toBe(200);

    const body = await (await getSchedule(app, workspaceId, 5)).json();
    const daysWithLunch = body.days.filter((d: { segments: unknown[] }) =>
      d.segments.some(
        (s: { type: string; entries?: { title: string }[] }) =>
          s.type === "block" &&
          s.entries?.some((entry) => entry.title === "Comida"),
      ),
    );
    // El dia elegido (pasado manana) sigue teniendo el bloque -no uno menos,
    // que es lo que daria interpretar la fecha pelada en UTC en un servidor
    // con offset negativo.
    expect(daysWithLunch).toHaveLength(3);
  });

  it("rejects endsAt on a block that does not repeat", async () => {
    const { app, workspaceId } = await setup();

    const response = await postBlock(app, workspaceId, {
      title: "Cita",
      kind: "fixed",
      startMinute: 60,
      endMinute: 120,
      plannedDate: tomorrow().toISOString(),
      endsAt: dayOffset(5).toISOString(),
    });
    expect(response.status).toBe(400);
  });

  it("moves a single block to another day", async () => {
    const { app, workspaceId } = await setup();
    const created = await (
      await postBlock(app, workspaceId, {
        title: "Cita",
        kind: "fixed",
        startMinute: 60,
        endMinute: 120,
        plannedDate: tomorrow().toISOString(),
      })
    ).json();

    const nextDay = dayOffset(2);
    const response = await patchBlock(app, workspaceId, created.id, {
      title: "Cita",
      kind: "fixed",
      startMinute: 60,
      endMinute: 120,
      plannedDate: nextDay.toISOString(),
    });
    expect(response.status).toBe(200);

    const [moved] = await db
      .select()
      .from(schema.scheduleBlockTable)
      .where(eq(schema.scheduleBlockTable.id, created.id));
    expect(dateKey(moved?.plannedDate as Date)).toBe(dateKey(nextDay));
  });

  it("refuses to move the day of a repeating block, and to set an end date on a single one", async () => {
    const { app, workspaceId } = await setup();

    const single = await (
      await postBlock(app, workspaceId, {
        title: "Cita",
        kind: "fixed",
        startMinute: 60,
        endMinute: 120,
        plannedDate: tomorrow().toISOString(),
      })
    ).json();
    const singleEndsAt = await patchBlock(app, workspaceId, single.id, {
      title: "Cita",
      kind: "fixed",
      startMinute: 60,
      endMinute: 120,
      endsAt: dayOffset(5).toISOString(),
    });
    expect(singleEndsAt.status).toBe(400);

    const repeating = await (
      await postBlock(app, workspaceId, {
        title: "Comida",
        kind: "break",
        startMinute: 13 * 60,
        endMinute: 14 * 60,
        cadence: { frequency: "daily", interval: 1 },
      })
    ).json();
    const repeatingPlannedDate = await patchBlock(
      app,
      workspaceId,
      repeating.id,
      {
        title: "Comida",
        kind: "break",
        startMinute: 13 * 60,
        endMinute: 14 * 60,
        plannedDate: tomorrow().toISOString(),
      },
    );
    expect(repeatingPlannedDate.status).toBe(400);
  });

  it("sets and then clears the end date of a repeating block", async () => {
    const { app, workspaceId } = await setup();
    const created = await (
      await postBlock(app, workspaceId, {
        title: "Comida",
        kind: "break",
        startMinute: 13 * 60,
        endMinute: 14 * 60,
        cadence: { frequency: "daily", interval: 1 },
      })
    ).json();

    const withLimit = await patchBlock(app, workspaceId, created.id, {
      title: "Comida",
      kind: "break",
      startMinute: 13 * 60,
      endMinute: 14 * 60,
      endsAt: dayOffset(1).toISOString(),
    });
    expect(withLimit.status).toBe(200);

    let body = await (await getSchedule(app, workspaceId, 5)).json();
    let daysWithLunch = body.days.filter((d: { segments: unknown[] }) =>
      d.segments.some(
        (s: { type: string; entries?: { title: string }[] }) =>
          s.type === "block" &&
          s.entries?.some((entry) => entry.title === "Comida"),
      ),
    );
    expect(daysWithLunch).toHaveLength(2); // hoy y manana

    const cleared = await patchBlock(app, workspaceId, created.id, {
      title: "Comida",
      kind: "break",
      startMinute: 13 * 60,
      endMinute: 14 * 60,
      endsAt: null,
    });
    expect(cleared.status).toBe(200);

    body = await (await getSchedule(app, workspaceId, 5)).json();
    daysWithLunch = body.days.filter((d: { segments: unknown[] }) =>
      d.segments.some(
        (s: { type: string; entries?: { title: string }[] }) =>
          s.type === "block" &&
          s.entries?.some((entry) => entry.title === "Comida"),
      ),
    );
    expect(daysWithLunch).toHaveLength(5);
  });

  it("decorates a block segment's entries with the full row, for the edit dialog", async () => {
    const { app, workspaceId } = await setup();
    const day = tomorrow();
    const created = await (
      await postBlock(app, workspaceId, {
        title: "Cita",
        kind: "fixed",
        startMinute: 60,
        endMinute: 120,
        plannedDate: day.toISOString(),
      })
    ).json();

    const body = await (await getSchedule(app, workspaceId, 3)).json();
    const segment = body.days
      .find((d: { dayDate: string }) => d.dayDate === dateKey(day))
      ?.segments.find(
        (s: { type: string; entries?: { title: string }[] }) =>
          s.type === "block" &&
          s.entries?.some((entry) => entry.title === "Cita"),
      );

    expect(segment?.entries[0]?.block).toMatchObject({
      id: created.id,
      title: "Cita",
      kind: "fixed",
      startMinute: 60,
      endMinute: 120,
    });
  });

  it("rejects a block that gives neither plannedDate nor cadence, or both", async () => {
    const { app, workspaceId } = await setup();

    const missing = await postBlock(app, workspaceId, {
      title: "Roto",
      kind: "fixed",
      startMinute: 60,
      endMinute: 120,
    });
    expect(missing.status).toBe(400);

    const both = await postBlock(app, workspaceId, {
      title: "Roto",
      kind: "fixed",
      startMinute: 60,
      endMinute: 120,
      plannedDate: tomorrow().toISOString(),
      cadence: { frequency: "daily", interval: 1 },
    });
    expect(both.status).toBe(400);
  });

  it("deletes a block", async () => {
    const { app, workspaceId } = await setup();
    const day = tomorrow();

    const created = await (
      await postBlock(app, workspaceId, {
        title: "Cita",
        kind: "fixed",
        startMinute: 60,
        endMinute: 120,
        plannedDate: day.toISOString(),
      })
    ).json();

    const response = await deleteBlock(app, workspaceId, created.id);
    expect(response.status).toBe(200);

    const rows = await db.select().from(schema.scheduleBlockTable);
    expect(rows).toHaveLength(0);
  });

  it("shows the running timer as a block on today", async () => {
    const { app, workspaceId, projectId, columnId, userId } = await setup();
    const task = await createTask(projectId, columnId);
    await db.insert(schema.timeEntryTable).values({
      taskId: task.id,
      userId,
      startTime: new Date(Date.now() - 5 * 60 * 1000),
      endTime: null,
    });

    const body = await (await getSchedule(app, workspaceId)).json();
    const today = body.days.find((d: { isToday: boolean }) => d.isToday);
    expect(
      today.segments.some(
        (s: { type: string; entries?: { kind: string }[] }) =>
          s.type === "block" &&
          s.entries?.some((entry) => entry.kind === "running"),
      ),
    ).toBe(true);
  });

  it("someone outside the workspace cannot read its schedule", async () => {
    const { workspaceId } = await setup();
    const outsider = await createWorkspaceMember({ role: "member" });
    const outsiderApp = asUser(outsider.user);

    const response = await getSchedule(outsiderApp, workspaceId);
    expect(response.status).toBe(403);
  });

  it("cannot update a block through another workspace of the same person", async () => {
    const { app, workspaceId, userId } = await setup();
    const created = await (
      await postBlock(app, workspaceId, {
        title: "Cita",
        kind: "fixed",
        startMinute: 60,
        endMinute: 120,
        plannedDate: tomorrow().toISOString(),
      })
    ).json();

    const otherWorkspace = await addToAnotherWorkspace(userId);
    const response = await patchBlock(app, otherWorkspace.id, created.id, {
      title: "Cita movida",
      kind: "fixed",
      startMinute: 60,
      endMinute: 150,
    });
    expect(response.status).toBe(404);

    const [unchanged] = await db
      .select()
      .from(schema.scheduleBlockTable)
      .where(eq(schema.scheduleBlockTable.id, created.id));
    expect(unchanged?.title).toBe("Cita");
  });

  it("cannot delete a block through another workspace of the same person", async () => {
    const { app, workspaceId, userId } = await setup();
    const created = await (
      await postBlock(app, workspaceId, {
        title: "Cita",
        kind: "fixed",
        startMinute: 60,
        endMinute: 120,
        plannedDate: tomorrow().toISOString(),
      })
    ).json();

    const otherWorkspace = await addToAnotherWorkspace(userId);
    const response = await deleteBlock(app, otherWorkspace.id, created.id);
    expect(response.status).toBe(404);

    const rows = await db.select().from(schema.scheduleBlockTable);
    expect(rows).toHaveLength(1);
  });

  it("cannot anchor a plan entry through another workspace of the same person", async () => {
    const { app, workspaceId, projectId, columnId, userId } = await setup();
    const task = await createTask(projectId, columnId);
    await assign(task.id, userId);
    await planTask(task.id, workspaceId, userId, tomorrow(), { position: 0 });

    const otherWorkspace = await addToAnotherWorkspace(userId);
    const response = await putEntryTime(
      app,
      otherWorkspace.id,
      task.id,
      9 * 60,
    );
    expect(response.status).toBe(404);
  });

  it("rejects a block startMinute of 1440 with 400, not 500", async () => {
    const { app, workspaceId } = await setup();

    const response = await postBlock(app, workspaceId, {
      title: "Roto",
      kind: "fixed",
      startMinute: 1440,
      endMinute: 1440,
      plannedDate: tomorrow().toISOString(),
    });
    expect(response.status).toBe(400);
  });

  it("rejects a plan entry startMinute of 1440 with 400, not 500", async () => {
    const { app, workspaceId, projectId, columnId, userId } = await setup();
    const task = await createTask(projectId, columnId);
    await assign(task.id, userId);
    await planTask(task.id, workspaceId, userId, tomorrow(), { position: 0 });

    const response = await putEntryTime(app, workspaceId, task.id, 1440);
    expect(response.status).toBe(400);
  });

  it("reports today's key so the client stops computing it with the browser clock", async () => {
    const { app, workspaceId } = await setup();

    const body = await (await getSchedule(app, workspaceId)).json();
    expect(body.serverToday).toBe(dateKey(new Date()));
  });

  it("reports the minimum and unestimated durations, so the web stops mirroring them", async () => {
    const { app, workspaceId } = await setup();

    const body = await (await getSchedule(app, workspaceId)).json();
    expect(body.minEntrySeconds).toBe(10 * 60);
    expect(body.unestimatedEntrySeconds).toBe(30 * 60);
  });

  it("accepts a window of up to 42 days and rejects one day beyond it", async () => {
    const { app, workspaceId } = await setup();

    const full = await getSchedule(app, workspaceId, 42);
    expect(full.status).toBe(200);

    const tooWide = await getSchedule(app, workspaceId, 43);
    expect(tooWide.status).toBe(400);
  });

  it("starts the window at `from` instead of the server's today", async () => {
    const { app, workspaceId, projectId, columnId, userId } = await setup();
    const inTwoWeeks = new Date();
    inTwoWeeks.setDate(inTwoWeeks.getDate() + 14);
    inTwoWeeks.setHours(0, 0, 0, 0);
    const task = await createTask(projectId, columnId, { estimate: 1800 });
    await assign(task.id, userId);
    await planTask(task.id, workspaceId, userId, inTwoWeeks, { position: 0 });

    // Sin `from`, la ventana por defecto (7 dias desde hoy) no la alcanza.
    const defaultWindow = await (await getSchedule(app, workspaceId)).json();
    expect(
      defaultWindow.days.some(
        (d: { dayDate: string }) => d.dayDate === dateKey(inTwoWeeks),
      ),
    ).toBe(false);

    const shifted = await (
      await getSchedule(app, workspaceId, 3, dateKey(inTwoWeeks))
    ).json();
    expect(shifted.days.map((d: { dayDate: string }) => d.dayDate)).toEqual([
      dateKey(inTwoWeeks),
      dateKey(new Date(inTwoWeeks.getTime() + 86400000)),
      dateKey(new Date(inTwoWeeks.getTime() + 2 * 86400000)),
    ]);
  });

  it("does not leak a plan entry planned from another workspace of the same person", async () => {
    const { app, workspaceId, projectId, columnId, userId } = await setup();
    const day = tomorrow();
    const task = await createTask(projectId, columnId, { estimate: 1800 });
    await assign(task.id, userId);
    await planTask(task.id, workspaceId, userId, day, { position: 0 });

    const otherWorkspace = await addToAnotherWorkspace(userId);
    const otherFixture = await createProjectFixture({
      workspaceId: otherWorkspace.id,
    });
    const otherTask = await createTask(
      otherFixture.project.id,
      otherFixture.columns.todo.id,
      { estimate: 1800 },
    );
    // Misma persona, misma fecha, pero planificada bajo el otro espacio: la
    // fila lleva `workspaceId: otherWorkspace.id`.
    await planTask(otherTask.id, otherWorkspace.id, userId, day, {
      position: 1,
    });

    const body = await (await getSchedule(app, workspaceId)).json();
    const dayLayout = body.days.find(
      (d: { dayDate: string }) => d.dayDate === dateKey(day),
    );
    const taskIds = dayLayout.segments
      .filter((s: { type: string }) => s.type !== "block")
      .map((s: { taskId: string }) => s.taskId);
    expect(taskIds).toContain(task.id);
    expect(taskIds).not.toContain(otherTask.id);
  });
});
