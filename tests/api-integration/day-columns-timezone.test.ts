import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import {
  parseServerDay,
  serverDayKey,
  startOfServerDay,
} from "../../apps/api/src/utils/day-boundaries";
import { migrateDayColumnsToLocalMidnight } from "../../apps/api/src/utils/migrate-day-columns-to-local-midnight";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
  taskTreeValues,
} from "./helpers/fixtures";

/**
 * ADR 049: la API pasa de UTC a `Europe/Madrid`. Estas pruebas corren en
 * Madrid (`vitest.integration.config.ts`), que es donde se ve el desfase.
 *
 * Una fila "vieja" es la que escribia la API en UTC: `parseServerDay` daba la
 * medianoche UTC, `yyyy-mm-dd 00:00`. Se fabrica con un `Date` en UTC porque
 * drizzle guarda la hora de pared UTC de lo que recibe.
 */
function legacyUtcMidnight(dayKey: string) {
  return new Date(`${dayKey}T00:00:00.000Z`);
}

async function storedWallTime(
  table: "personal_plan_entry" | "schedule_block",
  column: "planned_date" | "ends_at",
  id: string,
) {
  const result = await db.execute(
    sql`SELECT to_char(${sql.identifier(column)}, 'YYYY-MM-DD HH24:MI:SS') AS value FROM ${sql.identifier(table)} WHERE id = ${id}`,
  );
  return (result.rows[0] as { value: string | null }).value;
}

/**
 * Lo que manda el selector de fecha (`date.toISOString()` de la medianoche
 * local) desde un navegador en Madrid, sea cual sea la zona de la API.
 */
function browserMidnightToday() {
  const now = new Date();
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const offset = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Madrid",
    timeZoneName: "longOffset",
  })
    .formatToParts(now)
    .find((part) => part.type === "timeZoneName")
    ?.value.replace("GMT", "");
  return new Date(`${day}T00:00:00${offset || "+00:00"}`);
}

async function setup() {
  const member = await createWorkspaceMember({ role: "member" });
  const fixture = await createProjectFixture({
    workspaceId: member.workspace.id,
  });
  mockAuthenticatedSession(member.user);

  return {
    app: createApp().app,
    workspaceId: member.workspace.id,
    projectId: fixture.project.id,
    columnId: fixture.columns.todo.id,
    userId: member.user.id,
  };
}

async function createAssignedTask(
  ctx: Awaited<ReturnType<typeof setup>>,
  overrides: Partial<typeof schema.taskTable.$inferInsert> = {},
) {
  const [task] = await db
    .insert(schema.taskTable)
    .values({
      ...taskTreeValues(),
      projectId: ctx.projectId,
      title: "Revisar cuadro",
      status: "to-do",
      columnId: ctx.columnId,
      priority: "medium",
      number: 1,
      position: 0,
      userId: ctx.userId,
      ...overrides,
    })
    .returning();
  if (!task) throw new Error("Failed to seed task");
  await db
    .insert(schema.taskAssigneeTable)
    .values({ taskId: task.id, userId: ctx.userId });
  return task;
}

describe("day columns across the switch to Europe/Madrid", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  it("runs in Madrid, where local midnight is never UTC midnight", () => {
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe(
      "Europe/Madrid",
    );
    expect(startOfServerDay(new Date()).getUTCHours()).not.toBe(0);
  });

  it("moves plan entries stored at UTC midnight to Madrid midnight, so reordering the day works again", async () => {
    const ctx = await setup();
    const first = await createAssignedTask(ctx, { number: 1 });
    const second = await createAssignedTask(ctx, { number: 2 });
    const todayKey = serverDayKey(new Date());

    await db.insert(schema.personalPlanEntryTable).values(
      [first, second].map((task, position) => ({
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
        taskId: task.id,
        plannedDate: legacyUtcMidnight(todayKey),
        position,
      })),
    );

    const reorder = (taskIds: string[]) =>
      ctx.app.request(`/api/planner/order?workspaceId=${ctx.workspaceId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plannedDate: todayKey, taskIds }),
      });
    const positions = async () => {
      const rows = await db
        .select({
          taskId: schema.personalPlanEntryTable.taskId,
          position: schema.personalPlanEntryTable.position,
        })
        .from(schema.personalPlanEntryTable)
        .where(eq(schema.personalPlanEntryTable.userId, ctx.userId));
      return Object.fromEntries(rows.map((row) => [row.taskId, row.position]));
    };

    // El fallo que evita el normalizador: reordenar busca el dia por igualdad
    // exacta, la fila vieja no casa con la medianoche de Madrid, y el orden
    // pedido se ignora en silencio.
    expect((await reorder([second.id, first.id])).status).toBe(200);
    expect(await positions()).toEqual({ [first.id]: 0, [second.id]: 1 });

    const converted = await migrateDayColumnsToLocalMidnight();
    expect(converted["personal_plan_entry.planned_date"]).toBe(2);

    const [reloaded] = await db
      .select({ plannedDate: schema.personalPlanEntryTable.plannedDate })
      .from(schema.personalPlanEntryTable)
      .where(eq(schema.personalPlanEntryTable.taskId, first.id));
    expect(reloaded?.plannedDate.toISOString()).toBe(
      parseServerDay(todayKey, "plannedDate").toISOString(),
    );

    expect((await reorder([second.id, first.id])).status).toBe(200);
    expect(await positions()).toEqual({ [first.id]: 1, [second.id]: 0 });
  });

  it("is idempotent and leaves alone what is already a local day", async () => {
    const ctx = await setup();
    const [legacyTask, browserTask, oddTask] = await Promise.all([
      createAssignedTask(ctx, { number: 1 }),
      createAssignedTask(ctx, { number: 2 }),
      createAssignedTask(ctx, { number: 3 }),
    ]);
    if (!legacyTask || !browserTask || !oddTask) throw new Error("seed");

    const rows = await db
      .insert(schema.personalPlanEntryTable)
      .values([
        // Lo que escribia la API en UTC.
        {
          workspaceId: ctx.workspaceId,
          userId: ctx.userId,
          taskId: legacyTask.id,
          plannedDate: legacyUtcMidnight("2026-07-15"),
        },
        // Lo que mandaba el navegador antes del 2026-09-23: su medianoche de
        // Madrid. Con la API en Madrid ya es el dia correcto.
        {
          workspaceId: ctx.workspaceId,
          userId: ctx.userId,
          taskId: browserTask.id,
          plannedDate: new Date("2026-07-14T22:00:00.000Z"),
        },
        // Una hora cualquiera: no es un dia, no se toca.
        {
          workspaceId: ctx.workspaceId,
          userId: ctx.userId,
          taskId: oddTask.id,
          plannedDate: new Date("2026-07-15T09:30:00.000Z"),
        },
      ])
      .returning({ id: schema.personalPlanEntryTable.id });
    const [legacy, browser, odd] = rows.map((row) => row.id) as [
      string,
      string,
      string,
    ];

    const first = await migrateDayColumnsToLocalMidnight();
    expect(first["personal_plan_entry.planned_date"]).toBe(1);

    // Julio: Madrid va a UTC+2.
    expect(
      await storedWallTime("personal_plan_entry", "planned_date", legacy),
    ).toBe("2026-07-14 22:00:00");
    expect(
      await storedWallTime("personal_plan_entry", "planned_date", browser),
    ).toBe("2026-07-14 22:00:00");
    expect(
      await storedWallTime("personal_plan_entry", "planned_date", odd),
    ).toBe("2026-07-15 09:30:00");

    const second = await migrateDayColumnsToLocalMidnight();
    expect(Object.values(second).every((count) => count === 0)).toBe(true);
    expect(
      await storedWallTime("personal_plan_entry", "planned_date", legacy),
    ).toBe("2026-07-14 22:00:00");
  });

  it("uses each day's own offset, winter included", async () => {
    const ctx = await setup();
    const [block] = await db
      .insert(schema.scheduleBlockTable)
      .values({
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
        title: "Visita a obra",
        kind: "fixed",
        plannedDate: legacyUtcMidnight("2026-12-01"),
        startMinute: 600,
        endMinute: 660,
      })
      .returning();
    const [repeating] = await db
      .insert(schema.scheduleBlockTable)
      .values({
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
        title: "Comida de equipo",
        kind: "break",
        cadence: { frequency: "weekly", interval: 1, byWeekday: [1] },
        endsAt: legacyUtcMidnight("2026-10-26"),
        startMinute: 840,
        endMinute: 900,
      })
      .returning();
    if (!block || !repeating) throw new Error("Failed to seed blocks");

    const converted = await migrateDayColumnsToLocalMidnight();
    expect(converted["schedule_block.planned_date"]).toBe(1);
    expect(converted["schedule_block.ends_at"]).toBe(1);

    // Diciembre: UTC+1. Y el 26 de octubre ya es horario de invierno.
    expect(
      await storedWallTime("schedule_block", "planned_date", block.id),
    ).toBe("2026-11-30 23:00:00");
    expect(
      await storedWallTime("schedule_block", "ends_at", repeating.id),
    ).toBe("2026-10-25 23:00:00");
  });

  it("changes nothing for an instance that stays in UTC", async () => {
    const ctx = await setup();
    const task = await createAssignedTask(ctx);
    const [entry] = await db
      .insert(schema.personalPlanEntryTable)
      .values({
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
        taskId: task.id,
        plannedDate: legacyUtcMidnight("2026-07-15"),
      })
      .returning();
    if (!entry) throw new Error("Failed to seed plan entry");

    const converted = await migrateDayColumnsToLocalMidnight("UTC");
    expect(Object.values(converted).every((count) => count === 0)).toBe(true);
    expect(
      await storedWallTime("personal_plan_entry", "planned_date", entry.id),
    ).toBe("2026-07-15 00:00:00");
  });

  // El fallo que ya estaba en produccion con la API en UTC: el navegador
  // manda su medianoche de Madrid como vencimiento, y la API, contando el dia
  // en UTC, lo daba por vencido el mismo dia en que vencia.
  it("treats a due date picked in the browser as due today, not overdue", async () => {
    const ctx = await setup();
    const task = await createAssignedTask(ctx, {
      dueDate: browserMidnightToday(),
    });

    const dueIds = async (due: "today" | "overdue") => {
      const response = await ctx.app.request(
        `/api/my-work/tasks?workspaceId=${ctx.workspaceId}&scope=assigned&due=${due}`,
      );
      expect(response.status).toBe(200);
      const body = (await response.json()) as { tasks: { id: string }[] };
      return body.tasks.map((row) => row.id);
    };

    expect(await dueIds("today")).toContain(task.id);
    expect(await dueIds("overdue")).not.toContain(task.id);
  });
});
