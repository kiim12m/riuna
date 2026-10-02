import { beforeEach, describe, expect, it } from "vitest";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
  taskTreeValues,
} from "./helpers/fixtures";

type WeekSummary = {
  done: number;
  workedSeconds: number;
  estimatedSeconds: number;
  loggedOnEstimatedSeconds: number;
};

type WeekReview = {
  review: { blockers: string | null; summary: WeekSummary } | null;
  private: {
    impact: number | null;
    energy: number | null;
    note: string | null;
  } | null;
  stats: WeekSummary;
};

/** El lunes de esta semana, a medianoche local. */
function mondayOfThisWeek() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return date;
}

function keyOf(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function daysFrom(date: Date, days: number, hours = 10) {
  const shifted = new Date(date);
  shifted.setDate(shifted.getDate() + days);
  shifted.setHours(hours, 0, 0, 0);
  return shifted;
}

let number = 0;

async function task(
  projectId: string,
  {
    assignee,
    completedAt,
    estimate = null,
  }: { assignee?: string; completedAt?: Date; estimate?: number | null },
) {
  number += 1;
  const [row] = await db
    .insert(schema.taskTable)
    .values({
      ...taskTreeValues(),
      projectId,
      title: `Tarea ${number}`,
      status: completedAt ? "done" : "to-do",
      completedAt: completedAt ?? null,
      priority: "medium",
      number,
      estimate,
      userId: assignee ?? null,
    })
    .returning();
  if (assignee) {
    await db
      .insert(schema.taskAssigneeTable)
      .values({ taskId: row.id, userId: assignee });
  }
  return row;
}

async function logged(
  taskId: string,
  userId: string,
  startTime: Date,
  seconds: number,
) {
  await db.insert(schema.timeEntryTable).values({
    taskId,
    userId,
    startTime,
    endTime: new Date(startTime.getTime() + seconds * 1000),
    duration: seconds,
  });
}

describe("API integration: weekly review (sub-bloque 2.3)", () => {
  beforeEach(async () => {
    await resetTestDatabase();
    number = 0;
  });

  it("counts the week's done tasks, logged time and estimate accuracy", async () => {
    const member = await createWorkspaceMember();
    const other = await createWorkspaceMember();
    const { project } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });
    const monday = mondayOfThisWeek();
    const me = member.user.id;

    const estimated = await task(project.id, {
      assignee: me,
      completedAt: daysFrom(monday, 1),
      estimate: 3600,
    });
    const unestimated = await task(project.id, {
      assignee: me,
      completedAt: daysFrom(monday, 2),
    });
    // Estimada pero sin medir: no entra en la precision.
    await task(project.id, {
      assignee: me,
      completedAt: daysFrom(monday, 3),
      estimate: 5400,
    });
    // Terminada la semana anterior: no cuenta.
    await task(project.id, {
      assignee: me,
      completedAt: daysFrom(monday, -3),
      estimate: 7200,
    });
    // Terminada esta semana pero no es mia.
    await task(project.id, {
      assignee: other.user.id,
      completedAt: daysFrom(monday, 1),
      estimate: 1800,
    });
    const open = await task(project.id, { assignee: me });

    await logged(estimated.id, me, daysFrom(monday, 0), 3000);
    await logged(estimated.id, me, daysFrom(monday, -10), 2400);
    await logged(unestimated.id, me, daysFrom(monday, 2), 600);
    await logged(open.id, me, daysFrom(monday, 1), 1200);

    mockAuthenticatedSession(member.user);
    const { app } = createApp();
    const response = await app.request(
      `/api/review/week/${keyOf(monday)}?workspaceId=${member.workspace.id}`,
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as WeekReview;
    expect(body.review).toBeNull();
    expect(body.stats).toEqual({
      done: 3,
      // Solo lo registrado dentro de la semana, en cualquier tarea.
      workedSeconds: 3000 + 600 + 1200,
      estimatedSeconds: 3600,
      // Todo lo registrado en la tarea estimada, tambien antes de la semana.
      loggedOnEstimatedSeconds: 3000 + 2400,
    });
  });

  it("saves the review with its figures and keeps the rating apart from the day close", async () => {
    const member = await createWorkspaceMember();
    const monday = mondayOfThisWeek();
    mockAuthenticatedSession(member.user);
    const { app } = createApp();
    const ws = member.workspace.id;

    const put = await app.request(
      `/api/review/week/${keyOf(monday)}?workspaceId=${ws}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          blockers: "Falta el proveedor",
          impact: 4,
          energy: 1,
          note: "Semana dura",
        }),
      },
    );
    expect(put.status).toBe(200);
    const saved = (await put.json()) as WeekReview;
    expect(saved.review?.blockers).toBe("Falta el proveedor");
    expect(saved.review?.summary).toEqual(saved.stats);
    expect(saved.private).toEqual({
      impact: 4,
      energy: 1,
      note: "Semana dura",
    });

    // El cierre del dia del mismo lunes es otra fila.
    const day = await app.request(
      `/api/review/day/${keyOf(monday)}?workspaceId=${ws}`,
    );
    expect(await day.json()).toEqual({ review: null, private: null });
  });

  it("refuses a week that has not started", async () => {
    const member = await createWorkspaceMember();
    mockAuthenticatedSession(member.user);
    const { app } = createApp();
    const nextWeek = daysFrom(mondayOfThisWeek(), 7, 0);

    const response = await app.request(
      `/api/review/week/${keyOf(nextWeek)}?workspaceId=${member.workspace.id}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      },
    );

    expect(response.status).toBe(400);
  });
});
