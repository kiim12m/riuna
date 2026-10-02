import { beforeEach, describe, expect, it } from "vitest";
import db, { schema } from "../../apps/api/src/database";
import getToday from "../../apps/api/src/today/controllers/get-today";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
  taskTreeValues,
} from "./helpers/fixtures";

async function plannedAt(day: Date, startMinute: number | null) {
  const member = await createWorkspaceMember();
  const { project } = await createProjectFixture({
    workspaceId: member.workspace.id,
  });
  const [task] = await db
    .insert(schema.taskTable)
    .values({
      ...taskTreeValues(),
      projectId: project.id,
      title: "Llamar al proveedor",
      status: "to-do",
      priority: "medium",
      number: 1,
      userId: member.user.id,
    })
    .returning();
  await db
    .insert(schema.taskAssigneeTable)
    .values({ taskId: task.id, userId: member.user.id });
  await db.insert(schema.personalPlanEntryTable).values({
    workspaceId: member.workspace.id,
    userId: member.user.id,
    taskId: task.id,
    plannedDate: day,
    startMinute,
  });
  return member;
}

describe("API integration: anchored instants in Today (ADR 055)", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  it("gives the instant of the anchored time in Madrid", async () => {
    const day = new Date(2026, 9, 2);
    const member = await plannedAt(day, 600);

    const today = await getToday({
      workspaceId: member.workspace.id,
      userId: member.user.id,
      now: new Date(2026, 9, 2, 8, 0),
    });

    // 10:00 en Madrid en horario de verano es las 08:00 UTC.
    expect(today.planned[0]?.startsAt?.toISOString()).toBe(
      "2026-10-02T08:00:00.000Z",
    );
  });

  it("keeps the wall time on the day the clocks go back", async () => {
    const day = new Date(2026, 9, 25);
    const member = await plannedAt(day, 600);

    const today = await getToday({
      workspaceId: member.workspace.id,
      userId: member.user.id,
      now: new Date(2026, 9, 25, 8, 0),
    });

    // El 25 de octubre a las 03:00 se vuelve a las 02:00: las 10:00 ya son
    // UTC+1, no UTC+2.
    expect(today.planned[0]?.startsAt?.toISOString()).toBe(
      "2026-10-25T09:00:00.000Z",
    );
  });

  it("has no instant without an anchored time", async () => {
    const day = new Date(2026, 9, 2);
    const member = await plannedAt(day, null);

    const today = await getToday({
      workspaceId: member.workspace.id,
      userId: member.user.id,
      now: new Date(2026, 9, 2, 8, 0),
    });

    expect(today.planned[0]?.startsAt).toBeNull();
  });
});
