import { beforeEach, describe, expect, it } from "vitest";
import type { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { mockAnonymousSession, mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";

type App = ReturnType<typeof createApp>["app"];

function asUser(user: typeof schema.userTable.$inferSelect): App {
  mockAuthenticatedSession(user);
  return createApp().app;
}

const DEFAULT_SCHEDULE = {
  workStartMinute: 9 * 60,
  workEndMinute: 17 * 60,
  lunchEnabled: false,
  lunchStartMinute: null,
  lunchEndMinute: null,
  workDays: 0b0_111_110, // lunes a viernes
};

function getWorkSchedule(app: App) {
  return app.request("/api/work-schedule");
}

function putWorkSchedule(app: App, body: Record<string, unknown>) {
  return app.request("/api/work-schedule", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(async () => {
  await resetTestDatabase();
});

describe("work schedule (ADR 045)", () => {
  it("returns the super-productivity defaults when nothing was saved", async () => {
    const { user } = await createWorkspaceMember({ role: "owner" });
    const app = asUser(user);

    const response = await getWorkSchedule(app);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(DEFAULT_SCHEDULE);
  });

  it("saves a custom schedule and reflects it back on GET", async () => {
    const { user } = await createWorkspaceMember({ role: "owner" });
    const app = asUser(user);

    const custom = {
      workStartMinute: 8 * 60,
      workEndMinute: 16 * 60,
      lunchEnabled: true,
      lunchStartMinute: 12 * 60,
      lunchEndMinute: 12 * 60 + 30,
      workDays: 0b1_111_111, // los siete dias
    };

    const putResponse = await putWorkSchedule(app, custom);
    expect(putResponse.status).toBe(200);
    expect(await putResponse.json()).toEqual(custom);

    const getResponse = await getWorkSchedule(app);
    expect(await getResponse.json()).toEqual(custom);
  });

  it("overwrites a previously saved schedule instead of creating a second row", async () => {
    const { user } = await createWorkspaceMember({ role: "owner" });
    const app = asUser(user);

    await putWorkSchedule(app, {
      ...DEFAULT_SCHEDULE,
      workStartMinute: 7 * 60,
    });
    const second = await putWorkSchedule(app, {
      ...DEFAULT_SCHEDULE,
      workStartMinute: 10 * 60,
    });
    expect(second.status).toBe(200);

    const body = await (await getWorkSchedule(app)).json();
    expect(body.workStartMinute).toBe(10 * 60);
  });

  it("rejects an end time that is not after the start time, via the DB CHECK", async () => {
    const { user } = await createWorkspaceMember({ role: "owner" });
    const app = asUser(user);

    // No hay validacion cruzada aparte en la ruta -mismo convenio que
    // `schedule_block`-: lo impide `user_work_schedule_minutes_valid`, y eso
    // llega como 500 y no como un 400 legible. El formulario ya desactiva
    // "Guardar" antes de que esto pueda pasar de verdad.
    const response = await putWorkSchedule(app, {
      ...DEFAULT_SCHEDULE,
      workStartMinute: 17 * 60,
      workEndMinute: 9 * 60,
    });
    expect(response.status).toBe(500);
  });

  it("rejects a minute value out of range", async () => {
    const { user } = await createWorkspaceMember({ role: "owner" });
    const app = asUser(user);

    const response = await putWorkSchedule(app, {
      ...DEFAULT_SCHEDULE,
      workEndMinute: 1500,
    });
    expect(response.status).toBe(400);
  });

  it("does not let one person's schedule affect another's", async () => {
    const { user: userA } = await createWorkspaceMember({ role: "owner" });
    const { user: userB } = await createWorkspaceMember({ role: "owner" });

    await putWorkSchedule(asUser(userA), {
      ...DEFAULT_SCHEDULE,
      workStartMinute: 6 * 60,
    });

    const bSchedule = await (await getWorkSchedule(asUser(userB))).json();
    expect(bSchedule).toEqual(DEFAULT_SCHEDULE);
  });

  it("requires an authenticated session", async () => {
    mockAnonymousSession();
    const { app } = createApp();
    const response = await app.request("/api/work-schedule");
    expect(response.status).toBe(401);
  });
});

describe("work schedule feeds the planner's capacity (ADR 045)", () => {
  it("changes the planner's capacityByDay to match the saved hours", async () => {
    const { user, workspace } = await createWorkspaceMember({ role: "owner" });
    await createProjectFixture({ workspaceId: workspace.id });
    const app = asUser(user);

    // Jornada de 6 h, todos los dias de la semana.
    await putWorkSchedule(app, {
      workStartMinute: 9 * 60,
      workEndMinute: 15 * 60,
      lunchEnabled: false,
      lunchStartMinute: null,
      lunchEndMinute: null,
      workDays: 0b1_111_111,
    });

    const plan = await (
      await app.request(`/api/planner?workspaceId=${workspace.id}`)
    ).json();

    const values = Object.values(plan.capacityByDay) as number[];
    expect(values.length).toBeGreaterThan(0);
    for (const seconds of values) {
      expect(seconds).toBe(6 * 3600);
    }
  });

  it("changes the schedule's work hours to match the saved ones", async () => {
    const { user, workspace } = await createWorkspaceMember({ role: "owner" });
    await createProjectFixture({ workspaceId: workspace.id });
    const app = asUser(user);

    await putWorkSchedule(app, {
      ...DEFAULT_SCHEDULE,
      workStartMinute: 7 * 60,
      workEndMinute: 15 * 60,
    });

    const scheduleResponse = await (
      await app.request(`/api/schedule?workspaceId=${workspace.id}`)
    ).json();

    expect(scheduleResponse.workStartMinute).toBe(7 * 60);
    expect(scheduleResponse.workEndMinute).toBe(15 * 60);
  });
});
