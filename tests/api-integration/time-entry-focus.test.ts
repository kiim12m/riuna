import { eq } from "drizzle-orm";
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

function dayKey() {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

async function setup() {
  const member = await createWorkspaceMember({ role: "owner" });
  const { project } = await createProjectFixture({
    workspaceId: member.workspace.id,
  });
  const [task] = await db
    .insert(schema.taskTable)
    .values({
      ...taskTreeValues(),
      projectId: project.id,
      title: "Redactar informe",
      status: "to-do",
      priority: "medium",
      number: 1,
      userId: member.user.id,
    })
    .returning();
  mockAuthenticatedSession(member.user);
  const { app } = createApp();
  const ws = member.workspace.id;

  const start = (body: Record<string, unknown>) =>
    app.request("/api/time-entry/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskId: task.id, ...body }),
    });
  const stop = () =>
    app.request("/api/time-entry/stop", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
  const today = async () =>
    (await (await app.request(`/api/today?workspaceId=${ws}`)).json()) as {
      totals: { focusSessions: number };
    };

  return { member, task, app, ws, start, stop, today };
}

describe("API integration: focus sessions (ADR 056)", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  it("stores the focus mode and counts each work session in Today", async () => {
    const { start, stop, today, task } = await setup();

    const first = await start({ focusMode: "pomodoro" });
    expect(first.status).toBe(200);
    expect(((await first.json()) as { focusMode: string }).focusMode).toBe(
      "pomodoro",
    );
    await stop();
    await start({ focusMode: "pomodoro" });
    await stop();
    // Un cronometro normal no es una sesion de foco.
    await start({});
    await stop();

    expect((await today()).totals.focusSessions).toBe(2);
    const entries = await db
      .select()
      .from(schema.timeEntryTable)
      .where(eq(schema.timeEntryTable.taskId, task.id));
    expect(entries.map((entry) => entry.focusMode ?? "none").sort()).toEqual([
      "none",
      "pomodoro",
      "pomodoro",
    ]);
  });

  it("is idempotent for the same mode and opens a new session when the mode changes", async () => {
    const { start } = await setup();

    const plain = (await (await start({})).json()) as { id: string };
    const again = (await (await start({})).json()) as { id: string };
    expect(again.id).toBe(plain.id);

    const focus = (await (await start({ focusMode: "flowtime" })).json()) as {
      id: string;
      focusMode: string;
    };
    expect(focus.id).not.toBe(plain.id);
    expect(focus.focusMode).toBe("flowtime");

    const [closed] = await db
      .select()
      .from(schema.timeEntryTable)
      .where(eq(schema.timeEntryTable.id, plain.id));
    expect(closed.endTime).not.toBeNull();
  });

  it("rejects an unknown mode, and the database does too", async () => {
    const { start, task, member } = await setup();

    expect((await start({ focusMode: "siesta" })).status).toBe(400);
    await expect(
      db.insert(schema.timeEntryTable).values({
        taskId: task.id,
        userId: member.user.id,
        startTime: new Date(),
        focusMode: "siesta",
      }),
    ).rejects.toThrow();
  });

  it("keeps the sessions in the day close", async () => {
    const { start, stop, app, ws } = await setup();
    await start({ focusMode: "countdown" });
    await stop();

    const response = await app.request(
      `/api/review/day/${dayKey()}?workspaceId=${ws}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decisions: [] }),
      },
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      review: { summary: { focusSessions: number } };
    };
    expect(body.review.summary.focusSessions).toBe(1);
  });
});
