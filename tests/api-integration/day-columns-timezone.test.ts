import { beforeEach, describe, expect, it } from "vitest";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { startOfServerDay } from "../../apps/api/src/utils/day-boundaries";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
  taskTreeValues,
} from "./helpers/fixtures";

// ADR 049: la API vive en `Europe/Madrid`. Estas pruebas corren en Madrid
// (`vitest.integration.config.ts`), que es donde se ve el desfase.

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

describe("the API runs in Europe/Madrid", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  it("runs in Madrid, where local midnight is never UTC midnight", () => {
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe(
      "Europe/Madrid",
    );
    expect(startOfServerDay(new Date()).getUTCHours()).not.toBe(0);
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
