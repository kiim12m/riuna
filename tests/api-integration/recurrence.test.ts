import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { generateRecurringTasks } from "../../apps/api/src/recurrence/generate";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";

// `assertTemplateUsable` consulta la base, asi que puede fallar por algo que no
// es la plantilla. Se deja pinchar para simular ese corte; mientras nadie lo
// use, delega en la funcion real y el resto de pruebas no se entera.
const templateCheck = vi.hoisted(() => ({ failWith: null as Error | null }));

vi.mock("../../apps/api/src/recurrence/template", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../../apps/api/src/recurrence/template")
    >();

  return {
    ...actual,
    assertTemplateUsable: async (
      ...args: Parameters<typeof actual.assertTemplateUsable>
    ) => {
      if (templateCheck.failWith) throw templateCheck.failWith;
      return actual.assertTemplateUsable(...args);
    },
  };
});

const DAY = 86_400_000;

type Recurrence = {
  id: string;
  active: boolean;
  nextRunAt: string;
  generatedCount: number;
};

async function seedRecurrence({
  projectId,
  createdBy,
  nextRunAt,
  cadence = { frequency: "daily", interval: 1 },
  template = { title: "Parte semanal", priority: "medium" },
  endsAt,
  lastRunAt,
  active = true,
}: {
  projectId: string;
  createdBy: string;
  nextRunAt: Date;
  cadence?: Record<string, unknown>;
  template?: Record<string, unknown>;
  endsAt?: Date;
  lastRunAt?: Date;
  active?: boolean;
}) {
  const [row] = await db
    .insert(schema.taskRecurrenceTable)
    .values({
      projectId,
      createdBy,
      template,
      cadence,
      nextRunAt,
      endsAt: endsAt ?? null,
      lastRunAt: lastRunAt ?? null,
      active,
    })
    .returning();

  return row;
}

async function readRecurrence(id: string) {
  const [row] = await db
    .select({
      active: schema.taskRecurrenceTable.active,
      nextRunAt: schema.taskRecurrenceTable.nextRunAt,
    })
    .from(schema.taskRecurrenceTable)
    .where(eq(schema.taskRecurrenceTable.id, id));

  return row;
}

function startOfToday() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

async function tasksOf(projectId: string) {
  return db
    .select({
      id: schema.taskTable.id,
      title: schema.taskTable.title,
      recurrenceId: schema.taskTable.recurrenceId,
      dueDate: schema.taskTable.dueDate,
    })
    .from(schema.taskTable)
    .where(eq(schema.taskTable.projectId, projectId));
}

describe("API integration: recurring tasks", () => {
  beforeEach(async () => {
    templateCheck.failWith = null;
    await resetTestDatabase();
  });

  it("generates a task when the recurrence is due and advances the date", async () => {
    const member = await createWorkspaceMember({ role: "admin" });
    const { project } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });
    const recurrence = await seedRecurrence({
      projectId: project.id,
      createdBy: member.user.id,
      nextRunAt: new Date(Date.now() - DAY),
    });

    const outcome = await generateRecurringTasks();
    expect(outcome.degraded).toBe(false);

    const tasks = await tasksOf(project.id);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].title).toBe("Parte semanal");
    expect(tasks[0].recurrenceId).toBe(recurrence.id);

    const [after] = await db
      .select({ nextRunAt: schema.taskRecurrenceTable.nextRunAt })
      .from(schema.taskRecurrenceTable)
      .where(eq(schema.taskRecurrenceTable.id, recurrence.id));

    expect(after.nextRunAt.getTime()).toBeGreaterThan(Date.now());
  });

  // Lo que hace que el trabajo programado sea seguro: correr dos veces seguidas
  // no puede duplicar la tarea, porque la primera vuelta ya movio la fecha.
  it("does not generate twice when it runs again straight away", async () => {
    const member = await createWorkspaceMember({ role: "admin" });
    const { project } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });
    await seedRecurrence({
      projectId: project.id,
      createdBy: member.user.id,
      nextRunAt: new Date(Date.now() - DAY),
    });

    await generateRecurringTasks();
    await generateRecurringTasks();

    expect(await tasksOf(project.id)).toHaveLength(1);
  });

  // Si la instancia estuvo parada una semana se espera UNA tarea, no siete.
  it("catches up with a single task after a long outage", async () => {
    const member = await createWorkspaceMember({ role: "admin" });
    const { project } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });
    await seedRecurrence({
      projectId: project.id,
      createdBy: member.user.id,
      nextRunAt: new Date(Date.now() - 7 * DAY),
    });

    await generateRecurringTasks();

    expect(await tasksOf(project.id)).toHaveLength(1);
  });

  it("leaves a recurrence that is not due yet alone", async () => {
    const member = await createWorkspaceMember({ role: "admin" });
    const { project } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });
    await seedRecurrence({
      projectId: project.id,
      createdBy: member.user.id,
      nextRunAt: new Date(Date.now() + DAY),
    });

    await generateRecurringTasks();

    expect(await tasksOf(project.id)).toHaveLength(0);
  });

  it("ignores a paused recurrence", async () => {
    const member = await createWorkspaceMember({ role: "admin" });
    const { project } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });
    await seedRecurrence({
      projectId: project.id,
      createdBy: member.user.id,
      nextRunAt: new Date(Date.now() - DAY),
      active: false,
    });

    await generateRecurringTasks();

    expect(await tasksOf(project.id)).toHaveLength(0);
  });

  it("stops itself once it runs past its end date", async () => {
    const member = await createWorkspaceMember({ role: "admin" });
    const { project } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });
    const recurrence = await seedRecurrence({
      projectId: project.id,
      createdBy: member.user.id,
      nextRunAt: new Date(Date.now() - DAY),
      endsAt: new Date(Date.now() - DAY),
    });

    await generateRecurringTasks();

    const [after] = await db
      .select({ active: schema.taskRecurrenceTable.active })
      .from(schema.taskRecurrenceTable)
      .where(eq(schema.taskRecurrenceTable.id, recurrence.id));

    // La ocurrencia que tocaba se genera; la recurrencia se apaga despues.
    expect(await tasksOf(project.id)).toHaveLength(1);
    expect(after.active).toBe(false);
  });

  // Una fila que no se puede interpretar se apaga en vez de reintentarse cada
  // cinco minutos para siempre. La CHECK cubre la frecuencia; el titulo no.
  it("disables a recurrence whose template is unusable", async () => {
    const member = await createWorkspaceMember({ role: "admin" });
    const { project } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });
    const recurrence = await seedRecurrence({
      projectId: project.id,
      createdBy: member.user.id,
      nextRunAt: new Date(Date.now() - DAY),
      template: { title: "   " },
    });

    const outcome = await generateRecurringTasks();
    expect(outcome.degraded).toBe(true);

    const [after] = await db
      .select({ active: schema.taskRecurrenceTable.active })
      .from(schema.taskRecurrenceTable)
      .where(eq(schema.taskRecurrenceTable.id, recurrence.id));

    expect(after.active).toBe(false);
    expect(await tasksOf(project.id)).toHaveLength(0);
  });

  // La base tambien vigila la frecuencia, no solo la API.
  it("refuses an invalid cadence at the database level", async () => {
    const member = await createWorkspaceMember({ role: "admin" });
    const { project } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });

    await expect(
      db.insert(schema.taskRecurrenceTable).values({
        projectId: project.id,
        createdBy: member.user.id,
        template: { title: "X" },
        cadence: { frequency: "yearly" },
        nextRunAt: new Date(),
      }),
    ).rejects.toThrow();
  });

  it("creates, lists, pauses and deletes through the API", async () => {
    const member = await createWorkspaceMember({ role: "admin" });
    const { project } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const created = await app.request(`/api/recurrence/project/${project.id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        template: { title: "Revisión semanal", priority: "high" },
        cadence: { frequency: "weekly", interval: 1, byWeekday: [1] },
        startsAt: new Date().toISOString(),
      }),
    });
    expect(created.status).toBe(200);
    const recurrence = (await created.json()) as { id: string };

    const list = (await (
      await app.request(`/api/recurrence/project/${project.id}`)
    ).json()) as Recurrence[];
    expect(list).toHaveLength(1);
    expect(list[0].generatedCount).toBe(0);

    const paused = await app.request(`/api/recurrence/${recurrence.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ active: false }),
    });
    expect(paused.status).toBe(200);

    const removed = await app.request(`/api/recurrence/${recurrence.id}`, {
      method: "DELETE",
    });
    expect(removed.status).toBe(200);

    expect(
      (await (
        await app.request(`/api/recurrence/project/${project.id}`)
      ).json()) as Recurrence[],
    ).toHaveLength(0);
  });

  it("rejects a bad cadence and a bad template with a readable 400", async () => {
    const member = await createWorkspaceMember({ role: "admin" });
    const { project } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const badCadence = await app.request(
      `/api/recurrence/project/${project.id}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          template: { title: "X" },
          cadence: { frequency: "weekly", interval: 1, byWeekday: [] },
          startsAt: new Date().toISOString(),
        }),
      },
    );
    expect(badCadence.status).toBe(400);
    expect(await badCadence.text()).toContain("weekday");

    const badTemplate = await app.request(
      `/api/recurrence/project/${project.id}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          template: { title: "" },
          cadence: { frequency: "daily", interval: 1 },
          startsAt: new Date().toISOString(),
        }),
      },
    );
    expect(badTemplate.status).toBe(400);
  });

  // "Toca hoy" (ADR 026): una recurrencia que empieza hoy no puede estrenarse
  // manana. El inicio a medianoche ya habia pasado y se empujaba un dia.
  it("creates today's task when the recurrence starts today", async () => {
    const member = await createWorkspaceMember({ role: "admin" });
    const { project } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const created = await app.request(`/api/recurrence/project/${project.id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        template: { title: "Parte diario" },
        cadence: { frequency: "daily", interval: 1 },
        startsAt: new Date().toISOString(),
      }),
    });
    expect(created.status).toBe(200);
    const recurrence = (await created.json()) as { id: string };

    expect((await readRecurrence(recurrence.id)).nextRunAt).toEqual(
      startOfToday(),
    );

    await generateRecurringTasks();
    expect(await tasksOf(project.id)).toHaveLength(1);
  });

  // Cambiar la cadencia recoloca la proxima fecha aunque la vieja siguiera en
  // el futuro: si no, la primera ocurrencia seguia la regla anterior.
  it("moves a future next run when the cadence changes", async () => {
    const member = await createWorkspaceMember({ role: "admin" });
    const { project } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });
    const recurrence = await seedRecurrence({
      projectId: project.id,
      createdBy: member.user.id,
      cadence: { frequency: "weekly", interval: 1, byWeekday: [1] },
      nextRunAt: new Date(Date.now() + 5 * DAY),
      lastRunAt: new Date(Date.now() - 2 * DAY),
    });

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const response = await app.request(`/api/recurrence/${recurrence.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cadence: { frequency: "daily", interval: 1 } }),
    });
    expect(response.status).toBe(200);

    expect((await readRecurrence(recurrence.id)).nextRunAt).toEqual(
      startOfToday(),
    );
  });

  it("refuses a template whose status, assignee or team the project cannot take", async () => {
    const member = await createWorkspaceMember({ role: "admin" });
    const stranger = await createWorkspaceMember({ role: "admin" });
    const { project } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });
    const [foreignTeam] = await db
      .insert(schema.teamTable)
      .values({
        id: `team-${Date.now()}`,
        name: "Equipo ajeno",
        workspaceId: stranger.workspace.id,
        createdAt: new Date(),
      })
      .returning();

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const create = (template: Record<string, unknown>) =>
      app.request(`/api/recurrence/project/${project.id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          template: { title: "X", ...template },
          cadence: { frequency: "daily", interval: 1 },
          startsAt: new Date().toISOString(),
        }),
      });

    expect((await create({ status: "no-existe" })).status).toBe(400);
    expect((await create({ assigneeId: stranger.user.id })).status).toBe(403);
    expect((await create({ teamId: foreignTeam.id })).status).toBe(403);
  });

  // Una plantilla que el proyecto ya no admite fallaria en cada ocurrencia y se
  // perderian todas en silencio. Se apaga antes de reclamar la fecha, igual que
  // una plantilla ilegible.
  it("switches off a recurrence the project no longer accepts, without claiming the date", async () => {
    const member = await createWorkspaceMember({ role: "admin" });
    const { project } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });
    const nextRunAt = new Date(Date.now() - DAY);
    const recurrence = await seedRecurrence({
      projectId: project.id,
      createdBy: member.user.id,
      nextRunAt,
      template: { title: "Revision", status: "columna-borrada" },
    });

    const outcome = await generateRecurringTasks();
    expect(outcome.degraded).toBe(true);

    const after = await readRecurrence(recurrence.id);
    expect(after.active).toBe(false);
    expect(after.nextRunAt).toEqual(nextRunAt);
    expect(await tasksOf(project.id)).toHaveLength(0);
  });

  // La otra mitad del par: la comprobacion tambien puede fallar por algo que no
  // es la plantilla, y apagar por un corte de conexion dejaria apagadas para
  // siempre todas las recurrencias de esa vuelta.
  it("leaves a recurrence untouched when the check fails for a passing reason", async () => {
    const member = await createWorkspaceMember({ role: "admin" });
    const { project } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });
    const nextRunAt = new Date(Date.now() - DAY);
    const recurrence = await seedRecurrence({
      projectId: project.id,
      createdBy: member.user.id,
      nextRunAt,
    });

    templateCheck.failWith = new Error("connection terminated unexpectedly");
    const outcome = await generateRecurringTasks();
    expect(outcome.degraded).toBe(true);

    const after = await readRecurrence(recurrence.id);
    expect(after.active).toBe(true);
    expect(after.nextRunAt).toEqual(nextRunAt);
    expect(await tasksOf(project.id)).toHaveLength(0);

    // Y la vuelta siguiente, ya sin el corte, la genera.
    templateCheck.failWith = null;
    expect((await generateRecurringTasks()).degraded).toBe(false);
    expect(await tasksOf(project.id)).toHaveLength(1);
  });

  it("refuses a plain member and anyone outside the workspace", async () => {
    const owner = await createWorkspaceMember({ role: "admin" });
    const plain = await createWorkspaceMember({ role: "member" });
    const { project } = await createProjectFixture({
      workspaceId: owner.workspace.id,
    });

    mockAuthenticatedSession(plain.user);
    const asPlain = createApp();
    expect(
      (
        await asPlain.app.request(`/api/recurrence/project/${project.id}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            template: { title: "X" },
            cadence: { frequency: "daily", interval: 1 },
            startsAt: new Date().toISOString(),
          }),
        })
      ).status,
    ).toBe(403);

    const stranger = await createWorkspaceMember({ role: "admin" });
    mockAuthenticatedSession(stranger.user);
    const asStranger = createApp();
    expect(
      (await asStranger.app.request(`/api/recurrence/project/${project.id}`))
        .status,
    ).toBe(403);
  });
});
