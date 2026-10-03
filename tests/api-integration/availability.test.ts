import { randomUUID } from "node:crypto";
import type { User } from "better-auth/types";
import { beforeEach, describe, expect, it } from "vitest";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import { createWorkspaceMember } from "./helpers/fixtures";

function keyOf(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function dayFromNow(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return keyOf(date);
}

/** Una persona mas en el mismo espacio. */
async function addMember(workspaceId: string, role: string) {
  const id = `user-${randomUUID()}`;
  const [user] = await db
    .insert(schema.userTable)
    .values({
      id,
      email: `${id}@example.com`,
      emailVerified: true,
      name: "Otra persona",
    })
    .returning();
  await db.insert(schema.workspaceUserTable).values({
    workspaceId,
    userId: user.id,
    role,
    joinedAt: new Date(),
  });
  return user;
}

function as(user: User) {
  mockAuthenticatedSession(user);
  return createApp().app;
}

async function call(
  user: User,
  method: string,
  path: string,
  body?: unknown,
): Promise<Response> {
  return as(user).request(path, {
    method,
    ...(body === undefined
      ? {}
      : {
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
  });
}

/** Una semana entera: todos los dias laborables, con o sin la jornada. */
async function everyDayWorkSchedule(user: User) {
  const response = await call(user, "PUT", "/api/work-schedule", {
    workStartMinute: 9 * 60,
    workEndMinute: 17 * 60,
    lunchEnabled: false,
    lunchStartMinute: null,
    lunchEndMinute: null,
    workDays: 0b1_111_111,
  });
  expect(response.status).toBe(200);
}

/**
 * Ausencias y festivos (sub-bloque 5.1 del interludio de productividad,
 * ADR 060): un dia no disponible vale 0 en el Planificador, el Cronograma y
 * Hoy, la nota de la ausencia no sale de su lista, y los festivos solo los
 * gestiona quien administra el espacio.
 */
describe("availability", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  it("zeroes the capacity of absence days in the planner, the schedule and today, without the note", async () => {
    const { user, workspace } = await createWorkspaceMember({ role: "member" });
    const ws = workspace.id;
    await everyDayWorkSchedule(user);

    const created = await call(
      user,
      "POST",
      `/api/availability/time-off?workspaceId=${ws}`,
      { startsOn: dayFromNow(0), endsOn: dayFromNow(2), note: "Médico" },
    );
    expect(created.status).toBe(200);
    expect(await created.json()).toMatchObject({ note: "Médico" });

    const plan = await (
      await call(user, "GET", `/api/planner?workspaceId=${ws}`)
    ).json();
    for (const offset of [0, 1, 2]) {
      expect(plan.capacityByDay[dayFromNow(offset)]).toBe(0);
      expect(plan.unavailableByDay[dayFromNow(offset)]).toEqual({
        kind: "time-off",
        name: null,
      });
    }
    expect(plan.capacityByDay[dayFromNow(3)]).toBe(8 * 3600);
    expect(JSON.stringify(plan)).not.toContain("Médico");

    const schedule = await (
      await call(
        user,
        "GET",
        `/api/schedule?workspaceId=${ws}&from=${dayFromNow(1)}&days=1`,
      )
    ).json();
    expect(schedule.days[0].load.capacitySeconds).toBe(0);
    expect(schedule.days[0].unavailable).toEqual({
      kind: "time-off",
      name: null,
    });
    expect(JSON.stringify(schedule)).not.toContain("Médico");

    const today = await (
      await call(user, "GET", `/api/today?workspaceId=${ws}`)
    ).json();
    expect(today.totals.capacitySeconds).toBe(0);
    expect(today.unavailable).toEqual({ kind: "time-off", name: null });
    expect(JSON.stringify(today)).not.toContain("Médico");
  });

  it("validates the range and keeps each person's absences their own", async () => {
    const { user, workspace } = await createWorkspaceMember({ role: "member" });
    const ws = workspace.id;
    const other = await addMember(ws, "admin");
    const url = `/api/availability/time-off?workspaceId=${ws}`;

    expect(
      (
        await call(user, "POST", url, {
          startsOn: dayFromNow(3),
          endsOn: dayFromNow(1),
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await call(user, "POST", url, {
          startsOn: dayFromNow(0),
          endsOn: dayFromNow(400),
        })
      ).status,
    ).toBe(400);
    // Ni siquiera hay donde poner el motivo.
    const withReason = await call(user, "POST", url, {
      startsOn: dayFromNow(1),
      endsOn: dayFromNow(1),
      reason: "baja",
    });
    expect(withReason.status).toBe(200);
    const absence = await withReason.json();
    expect(absence).not.toHaveProperty("reason");

    // La otra persona -aunque administre el espacio- no la ve ni la borra.
    expect(await (await call(other, "GET", url)).json()).toEqual([]);
    expect(
      (
        await call(
          other,
          "DELETE",
          `/api/availability/time-off/${absence.id}?workspaceId=${ws}`,
        )
      ).status,
    ).toBe(404);

    // Ni le cambia su capacidad.
    await everyDayWorkSchedule(other);
    const otherPlan = await (
      await call(other, "GET", `/api/planner?workspaceId=${ws}`)
    ).json();
    expect(otherPlan.capacityByDay[dayFromNow(1)]).toBe(8 * 3600);

    expect(
      (
        await call(
          user,
          "DELETE",
          `/api/availability/time-off/${absence.id}?workspaceId=${ws}`,
        )
      ).status,
    ).toBe(200);
    expect(await (await call(user, "GET", url)).json()).toEqual([]);
  });

  it("lets only workspace managers add holidays, which every member then sees", async () => {
    const { user: admin, workspace } = await createWorkspaceMember({
      role: "admin",
    });
    const ws = workspace.id;
    const member = await addMember(ws, "member");
    const url = `/api/availability/holidays?workspaceId=${ws}`;
    const holiday = { day: dayFromNow(4), name: "Fiesta local" };

    expect((await call(member, "POST", url, holiday)).status).toBe(403);
    const created = await call(admin, "POST", url, holiday);
    expect(created.status).toBe(200);
    expect((await call(admin, "POST", url, holiday)).status).toBe(409);

    expect(await (await call(member, "GET", url)).json()).toEqual([
      expect.objectContaining({ name: "Fiesta local" }),
    ]);

    await everyDayWorkSchedule(member);
    const plan = await (
      await call(member, "GET", `/api/planner?workspaceId=${ws}`)
    ).json();
    expect(plan.capacityByDay[dayFromNow(4)]).toBe(0);
    expect(plan.unavailableByDay[dayFromNow(4)]).toEqual({
      kind: "holiday",
      name: "Fiesta local",
    });

    const { id } = await created.json();
    expect(
      (
        await call(
          member,
          "DELETE",
          `/api/availability/holidays/${id}?workspaceId=${ws}`,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await call(
          admin,
          "DELETE",
          `/api/availability/holidays/${id}?workspaceId=${ws}`,
        )
      ).status,
    ).toBe(200);
    const after = await (
      await call(member, "GET", `/api/planner?workspaceId=${ws}`)
    ).json();
    expect(after.capacityByDay[dayFromNow(4)]).toBe(8 * 3600);
  });

  it("keeps a workspace's holidays and absences out of another workspace", async () => {
    const here = await createWorkspaceMember({ role: "owner" });
    const there = await createWorkspaceMember({
      role: "owner",
      user: here.user,
    });
    await everyDayWorkSchedule(here.user);

    await call(
      here.user,
      "POST",
      `/api/availability/holidays?workspaceId=${here.workspace.id}`,
      { day: dayFromNow(2), name: "Solo aquí" },
    );
    await call(
      here.user,
      "POST",
      `/api/availability/time-off?workspaceId=${here.workspace.id}`,
      { startsOn: dayFromNow(5), endsOn: dayFromNow(5) },
    );

    const plan = await (
      await call(
        here.user,
        "GET",
        `/api/planner?workspaceId=${there.workspace.id}`,
      )
    ).json();
    expect(plan.unavailableByDay).toEqual({});
    expect(plan.capacityByDay[dayFromNow(2)]).toBe(8 * 3600);
    expect(plan.capacityByDay[dayFromNow(5)]).toBe(8 * 3600);
  });

  it("shows the holiday when it falls inside an absence", async () => {
    const { user, workspace } = await createWorkspaceMember({ role: "owner" });
    const ws = workspace.id;
    await call(user, "POST", `/api/availability/time-off?workspaceId=${ws}`, {
      startsOn: dayFromNow(1),
      endsOn: dayFromNow(3),
    });
    await call(user, "POST", `/api/availability/holidays?workspaceId=${ws}`, {
      day: dayFromNow(2),
      name: "Fiesta local",
    });

    const plan = await (
      await call(user, "GET", `/api/planner?workspaceId=${ws}`)
    ).json();
    expect(plan.unavailableByDay[dayFromNow(1)].kind).toBe("time-off");
    expect(plan.unavailableByDay[dayFromNow(2)]).toEqual({
      kind: "holiday",
      name: "Fiesta local",
    });
    expect(plan.unavailableByDay[dayFromNow(3)].kind).toBe("time-off");
  });
});
