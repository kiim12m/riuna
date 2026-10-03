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

const MINUTE = 60 * 1000;

async function taskIn(workspaceId: string, userId: string) {
  const { project } = await createProjectFixture({ workspaceId });
  const [task] = await db
    .insert(schema.taskTable)
    .values({
      ...taskTreeValues(),
      projectId: project.id,
      title: "Redactar informe",
      status: "to-do",
      priority: "medium",
      number: 1,
      userId,
    })
    .returning();
  return task;
}

/** Una persona en dos espacios, para comprobar que el ritmo los cuenta todos. */
async function setup() {
  const member = await createWorkspaceMember({ role: "owner" });
  const other = await createWorkspaceMember({
    role: "owner",
    user: member.user,
  });
  const here = await taskIn(member.workspace.id, member.user.id);
  const there = await taskIn(other.workspace.id, member.user.id);
  mockAuthenticatedSession(member.user);
  const { app } = createApp();

  const entry = (taskId: string, start: Date, end: Date | null) =>
    db.insert(schema.timeEntryTable).values({
      taskId,
      userId: member.user.id,
      description: "",
      startTime: start,
      endTime: end,
      duration: end ? Math.round((end.getTime() - start.getTime()) / 1000) : 0,
    });
  const running = async () => {
    const response = await app.request(
      `/api/time-entry/running?workspaceId=${member.workspace.id}`,
    );
    expect(response.status).toBe(200);
    return response.json();
  };

  return { here, there, entry, running };
}

/**
 * Lo que leen los avisos de ritmo (sub-bloque 3.3 del interludio de
 * productividad, ADR 056): desde cuando se trabaja sin descanso y cuando se
 * paro por ultima vez, en cualquier espacio.
 */
describe("time-entry running: rhythm", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  it("chains entries without a five-minute gap, across workspaces, into workingSince", async () => {
    const { here, there, entry, running } = await setup();
    const now = Date.now();
    const at = (minutesAgo: number) => new Date(now - minutesAgo * MINUTE);

    // Antes del descanso: no cuenta.
    await entry(here.id, at(240), at(180));
    // Descanso de 10 minutos; luego tres tramos con huecos de menos de 5,
    // uno de ellos en el otro espacio.
    await entry(there.id, at(170), at(120));
    await entry(here.id, at(118), at(60));
    await entry(here.id, at(59), null);

    const body = await running();
    expect(body.running).not.toBeNull();
    expect(new Date(body.running.workingSince).getTime()).toBe(
      at(170).getTime(),
    );
    expect(body.lastStoppedAt).toBeNull();
  });

  it("starts the streak at the running entry after a break of five minutes or more", async () => {
    const { here, entry, running } = await setup();
    const now = Date.now();
    const at = (minutesAgo: number) => new Date(now - minutesAgo * MINUTE);

    await entry(here.id, at(90), at(35));
    await entry(here.id, at(30), null);

    const body = await running();
    expect(new Date(body.running.workingSince).getTime()).toBe(
      at(30).getTime(),
    );
  });

  it("reports when the user last stopped tracking, in any workspace", async () => {
    const { here, there, entry, running } = await setup();
    const now = Date.now();
    const at = (minutesAgo: number) => new Date(now - minutesAgo * MINUTE);

    await entry(here.id, at(120), at(90));
    await entry(there.id, at(60), at(40));

    const body = await running();
    expect(body.running).toBeNull();
    expect(new Date(body.lastStoppedAt).getTime()).toBe(at(40).getTime());
  });

  it("has no lastStoppedAt for someone who never tracked", async () => {
    const { running } = await setup();
    const body = await running();
    expect(body.running).toBeNull();
    expect(body.lastStoppedAt).toBeNull();
  });
});
