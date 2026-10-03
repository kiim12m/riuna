import { randomUUID } from "node:crypto";
import type { User } from "better-auth/types";
import { beforeEach, describe, expect, it } from "vitest";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { createApiKey, mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
  taskTreeValues,
} from "./helpers/fixtures";

function startOfToday() {
  const day = new Date();
  day.setHours(0, 0, 0, 0);
  return day;
}

async function person(workspaceId: string, name: string) {
  const id = `user-${randomUUID()}`;
  const [user] = await db
    .insert(schema.userTable)
    .values({ id, email: `${id}@example.com`, emailVerified: true, name })
    .returning();
  await db.insert(schema.workspaceUserTable).values({
    workspaceId,
    userId: user.id,
    role: "member",
    joinedAt: new Date(),
  });
  // Todos los dias laborables: la prueba no depende de que dia se ejecute.
  await db.insert(schema.userWorkScheduleTable).values({
    userId: user.id,
    workDays: 0b1_111_111,
  });
  return user;
}

async function team(workspaceId: string, lead: User, members: User[]) {
  const [row] = await db
    .insert(schema.teamTable)
    .values({
      id: `team-${randomUUID()}`,
      name: "Obras",
      workspaceId,
      createdAt: new Date(),
    })
    .returning();
  await db.insert(schema.teamMemberTable).values([
    { id: `tm-${randomUUID()}`, teamId: row.id, userId: lead.id, isLead: true },
    ...members.map((member) => ({
      id: `tm-${randomUUID()}`,
      teamId: row.id,
      userId: member.id,
    })),
  ]);
}

function as(user: User) {
  mockAuthenticatedSession(user);
  return createApp().app;
}

async function setup() {
  const { workspace } = await createWorkspaceMember({ role: "owner" });
  const ws = workspace.id;
  const { project, columns } = await createProjectFixture({ workspaceId: ws });
  const lead = await person(ws, "Lucía");
  const ana = await person(ws, "Ana");
  const blas = await person(ws, "Blas");
  const carla = await person(ws, "Carla");
  await team(ws, lead, [ana, blas]);

  let number = 0;
  const task = async (title: string, extra: Record<string, unknown> = {}) => {
    number += 1;
    const [row] = await db
      .insert(schema.taskTable)
      .values({
        ...taskTreeValues(),
        projectId: project.id,
        title,
        status: columns.todo.slug,
        priority: "medium",
        number,
        userId: ana.id,
        ...extra,
      })
      .returning();
    return row;
  };
  const plan = (
    user: User,
    taskId: string,
    extra: Record<string, unknown> = {},
  ) =>
    db.insert(schema.personalPlanEntryTable).values({
      workspaceId: ws,
      userId: user.id,
      taskId,
      plannedDate: startOfToday(),
      ...extra,
    });

  return { ws, columns, lead, ana, blas, carla, task, plan };
}

/**
 * La vista del responsable (sub-bloque 5.3 del interludio de productividad,
 * ADR 059): el dia y el stand-up de su gente, en solo lectura, con ausencias
 * y festivos, y nunca la valoracion privada ni la nota de una ausencia.
 */
describe("lead team day", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  it("shows each led person's day, and nothing private or from outside the team", async () => {
    const { ws, columns, lead, ana, blas, carla, task, plan } = await setup();
    const today = startOfToday();

    const loose = await task("Revisar planos", { estimate: 3600 });
    const key = await task("Llamar al proveedor", { estimate: 1800 });
    await plan(ana, loose.id);
    await plan(ana, key.id, { startMinute: 10 * 60, keyRank: 1 });
    const finished = await task("Entregar memoria", {
      status: columns.done.slug,
      completedAt: new Date(),
    });
    await db
      .insert(schema.taskAssigneeTable)
      .values({ taskId: finished.id, userId: ana.id });
    await db.insert(schema.timeEntryTable).values({
      taskId: loose.id,
      userId: ana.id,
      description: "",
      startTime: new Date(today.getTime() + 8 * 3600 * 1000),
      endTime: new Date(today.getTime() + 8.5 * 3600 * 1000),
      duration: 1800,
    });
    const [review] = await db
      .insert(schema.reviewTable)
      .values({
        workspaceId: ws,
        userId: ana.id,
        period: "day",
        periodStart: today,
        blockers: "Falta el permiso de obra",
        summary: { done: 1, workedSeconds: 1800, moved: 0, unplanned: 0 },
      })
      .returning();
    await db.insert(schema.reviewPrivateTable).values({
      reviewId: review.id,
      impact: 2,
      energy: 1,
      note: "Estoy agotada",
    });
    await db.insert(schema.userTimeOffTable).values({
      workspaceId: ws,
      userId: blas.id,
      startsOn: today,
      endsOn: today,
      note: "Médico",
    });
    const secret = await task("Asunto de Carla");
    await plan(carla, secret.id);

    const response = await as(lead).request(`/api/lead/day?workspaceId=${ws}`);
    expect(response.status).toBe(200);
    const body = await response.json();
    const text = JSON.stringify(body);

    expect(body.members.map((m: { name: string }) => m.name)).toEqual([
      "Ana",
      "Blas",
    ]);
    const [anaDay, blasDay] = body.members;
    expect(
      anaDay.planned.map((entry: { title: string }) => entry.title),
    ).toEqual(["Llamar al proveedor", "Revisar planos"]);
    expect(anaDay.load).toEqual({
      loadSeconds: 1800 + (3600 - 1800),
      capacitySeconds: 8 * 3600,
      pct: Math.round(((1800 + 1800) / (8 * 3600)) * 100),
    });
    expect(anaDay.done.map((t: { title: string }) => t.title)).toEqual([
      "Entregar memoria",
    ]);
    expect(anaDay.workedSeconds).toBe(1800);
    expect(anaDay.close).toEqual({
      blockers: "Falta el permiso de obra",
      summary: { done: 1, workedSeconds: 1800, moved: 0, unplanned: 0 },
    });
    expect(blasDay.unavailable).toEqual({ kind: "time-off", name: null });
    expect(blasDay.load.capacitySeconds).toBe(0);

    // Nunca la valoracion, la nota de la ausencia ni nada de Carla.
    for (const leak of ["Estoy agotada", "impact", "energy", "Médico"]) {
      expect(text).not.toContain(leak);
    }
    expect(text).not.toContain("Asunto de Carla");
  });

  it("gives the same stand-up each person sees, without the private rating", async () => {
    const { ws, lead, ana, task, plan } = await setup();
    const loose = await task("Revisar planos");
    const key = await task("Llamar al proveedor");
    await plan(ana, loose.id);
    await plan(ana, key.id, { keyRank: 1 });
    const [review] = await db
      .insert(schema.reviewTable)
      .values({
        workspaceId: ws,
        userId: ana.id,
        period: "day",
        periodStart: startOfToday(),
        blockers: "Falta el permiso de obra",
      })
      .returning();
    await db
      .insert(schema.reviewPrivateTable)
      .values({ reviewId: review.id, note: "Estoy agotada" });

    const team = await (
      await as(lead).request(`/api/lead/standup?workspaceId=${ws}`)
    ).json();
    const own = await (
      await as(ana).request(`/api/review/standup?workspaceId=${ws}`)
    ).json();

    const anaStandup = team.members.find(
      (member: { id: string }) => member.id === ana.id,
    ).standup;
    expect(anaStandup).toEqual(own);
    expect(anaStandup.today.planned[0].title).toBe("Llamar al proveedor");
    expect(anaStandup.blockers).toBe("Falta el permiso de obra");
    expect(JSON.stringify(team)).not.toContain("Estoy agotada");
  });

  // Revision de codigo del interludio, hallazgo 3: la vista del responsable
  // no miraba el alcance de la clave de API.
  it("respects the API key scope for the lead's reads", async () => {
    const { ws, lead } = await setup();
    const { app } = createApp();
    const labelsOnly = await createApiKey(lead.id, { label: ["read"] });
    const taskReader = await createApiKey(lead.id, { task: ["read"] });
    for (const path of ["day", "standup", "members", "my-leads"]) {
      const url = `/api/lead/${path}?workspaceId=${ws}`;
      expect(
        (await app.request(url, { headers: { "x-api-key": labelsOnly } }))
          .status,
      ).toBe(403);
      expect(
        (await app.request(url, { headers: { "x-api-key": taskReader } }))
          .status,
      ).toBe(200);
    }
  });

  it("shows nothing to someone who leads nobody", async () => {
    const { ws, ana } = await setup();
    for (const path of ["day", "standup"]) {
      const body = await (
        await as(ana).request(`/api/lead/${path}?workspaceId=${ws}`)
      ).json();
      expect(body.members).toEqual([]);
    }
    expect(
      await (
        await as(ana).request(`/api/lead/members?workspaceId=${ws}`)
      ).json(),
    ).toEqual([]);
  });
});
