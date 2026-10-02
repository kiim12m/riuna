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

type Standup = {
  yesterday: {
    day: string;
    done: { id: string; title: string }[];
    closed: boolean;
  };
  today: { day: string; planned: { id: string; keyRank: number | null }[] };
  blockers: string | null;
};

function keyOf(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/** El ultimo dia laborable antes de hoy con la jornada por defecto, de lunes a viernes. */
function previousWorkDay() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  do {
    date.setDate(date.getDate() - 1);
  } while (date.getDay() === 0 || date.getDay() === 6);
  return date;
}

let number = 0;

async function myTask(
  projectId: string,
  userId: string,
  title: string,
  completedAt?: Date,
) {
  number += 1;
  const [task] = await db
    .insert(schema.taskTable)
    .values({
      ...taskTreeValues(),
      projectId,
      title,
      status: completedAt ? "done" : "to-do",
      completedAt: completedAt ?? null,
      priority: "medium",
      number,
      userId,
    })
    .returning();
  await db.insert(schema.taskAssigneeTable).values({ taskId: task.id, userId });
  return task;
}

describe("API integration: stand-up (sub-bloque 2.4)", () => {
  beforeEach(async () => {
    await resetTestDatabase();
    number = 0;
  });

  it("derives yesterday, today and blockers, and never the private rating", async () => {
    const member = await createWorkspaceMember();
    const { project } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });
    const me = member.user.id;
    const ws = member.workspace.id;
    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const yesterday = previousWorkDay();
    const finishedAt = new Date(yesterday);
    finishedAt.setHours(11, 0, 0, 0);
    const finished = await myTask(project.id, me, "Revisar planos", finishedAt);
    const first = await myTask(project.id, me, "Llamar al cliente");
    const key = await myTask(project.id, me, "Pedir material");
    for (const task of [first, key]) {
      await app.request(`/api/planner/${task.id}?workspaceId=${ws}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plannedDate: keyOf(new Date()) }),
      });
    }
    await app.request(`/api/planner/${key.id}/key?workspaceId=${ws}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: true }),
    });
    await app.request(`/api/review/day/${keyOf(yesterday)}?workspaceId=${ws}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        decisions: [],
        blockers: "Esperando al proveedor",
        impact: 1,
        note: "Nota secreta",
      }),
    });

    const response = await app.request(`/api/review/standup?workspaceId=${ws}`);

    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).not.toContain("Nota secreta");
    expect(text).not.toContain("impact");
    const standup = JSON.parse(text) as Standup;
    expect(standup.yesterday).toMatchObject({
      day: keyOf(yesterday),
      closed: true,
    });
    expect(standup.yesterday.done.map((task) => task.id)).toEqual([
      finished.id,
    ]);
    expect(
      standup.today.planned.map((task) => [task.id, task.keyRank]),
    ).toEqual([
      [key.id, 1],
      [first.id, null],
    ]);
    expect(standup.blockers).toBe("Esperando al proveedor");
  });

  it("works with nothing to say", async () => {
    const member = await createWorkspaceMember();
    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const response = await app.request(
      `/api/review/standup?workspaceId=${member.workspace.id}`,
    );

    expect(await response.json()).toMatchObject({
      yesterday: { done: [], closed: false },
      today: { planned: [] },
      blockers: null,
    });
  });
});
