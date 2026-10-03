import { createHash, randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
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

/** `yyyy-mm-dd` dentro de `days` dias, hora local. */
function dayFromNow(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(0, 0, 0, 0);
  return date;
}

async function setup() {
  const member = await createWorkspaceMember({ role: "member" });
  const workspaceId = member.workspace.id;
  const userId = member.user.id;
  const { project } = await createProjectFixture({ workspaceId });

  let number = 0;
  const task = async (title: string, extra: Record<string, unknown> = {}) => {
    number += 1;
    const [row] = await db
      .insert(schema.taskTable)
      .values({
        ...taskTreeValues(),
        projectId: project.id,
        title,
        status: "to-do",
        priority: "medium",
        number,
        userId,
        ...extra,
      })
      .returning();
    return row;
  };

  mockAuthenticatedSession(member.user);
  const { app } = createApp();
  const feedUrl = `/api/calendar/feed?workspaceId=${workspaceId}`;
  const createFeed = async () => {
    const response = await app.request(feedUrl, { method: "POST" });
    expect(response.status).toBe(200);
    return (await response.json()) as { token: string; createdAt: string };
  };
  const ics = (token: string) => app.request(`/api/calendar/${token}.ics`);

  return {
    member,
    workspaceId,
    userId,
    project,
    task,
    app,
    feedUrl,
    createFeed,
    ics,
  };
}

/**
 * El enlace del calendario (sub-bloque 4.1 del interludio de productividad,
 * ADR 057): el token se enseña una vez, el `.ics` lleva el plan con hora, los
 * bloques y los vencimientos, y el enlace deja de servir al revocarlo,
 * regenerarlo o salir del espacio.
 */
describe("calendar feed", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  it("shows the token once and keeps only its hash", async () => {
    const { feedUrl, app, createFeed } = await setup();

    const before = await (await app.request(feedUrl)).json();
    expect(before).toEqual({ active: false, createdAt: null });

    const { token } = await createFeed();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const after = await (await app.request(feedUrl)).json();
    expect(after.active).toBe(true);
    expect(JSON.stringify(after)).not.toContain(token);

    const [row] = await db.select().from(schema.calendarFeedTable);
    expect(row.tokenHash).toBe(
      createHash("sha256").update(token).digest("hex"),
    );
    expect(JSON.stringify(row)).not.toContain(token);
  });

  it("serves the plan with times, the blocks and the assigned due dates, and nothing else", async () => {
    const { workspaceId, userId, task, createFeed, ics } = await setup();
    const tomorrow = dayFromNow(1);

    const anchored = await task("Llamar al proveedor", { estimate: 45 * 60 });
    const loose = await task("Sin hora");
    const due = await task("Entregar memoria", { dueDate: dayFromNow(3) });
    const notMine = await task("De otra persona", { dueDate: dayFromNow(3) });
    await db
      .insert(schema.taskAssigneeTable)
      .values({ taskId: due.id, userId });
    await db.insert(schema.personalPlanEntryTable).values([
      {
        workspaceId,
        userId,
        taskId: anchored.id,
        plannedDate: tomorrow,
        startMinute: 10 * 60,
      },
      { workspaceId, userId, taskId: loose.id, plannedDate: tomorrow },
    ]);
    await db.insert(schema.scheduleBlockTable).values([
      {
        workspaceId,
        userId,
        title: "Comida de equipo",
        kind: "fixed",
        plannedDate: tomorrow,
        startMinute: 14 * 60,
        endMinute: 15 * 60,
      },
      {
        workspaceId,
        userId,
        title: "Reunión semanal",
        kind: "fixed",
        cadence: { frequency: "weekly", interval: 1, byWeekday: [1] },
        startMinute: 9 * 60,
        endMinute: 9 * 60 + 30,
      },
    ]);

    const { token } = await createFeed();
    const response = await ics(token);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/calendar");
    const body = (await response.text()).replaceAll("\r\n ", "");

    const start = new Date(tomorrow);
    start.setHours(10, 0, 0, 0);
    const stamp = (date: Date) =>
      `${date.toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`;
    expect(body).toContain(`UID:riuna-plan-${anchored.id}`);
    expect(body).toContain(`DTSTART:${stamp(start)}`);
    expect(body).toContain(
      `DTEND:${stamp(new Date(start.getTime() + 45 * 60 * 1000))}`,
    );
    expect(body).toContain("SUMMARY:Comida de equipo");
    expect(body).toContain("SUMMARY:Reunión semanal");
    expect(body).toContain("RRULE:FREQ=WEEKLY;BYDAY=MO");
    expect(body).toContain("BEGIN:VTIMEZONE");
    expect(body).toContain(`UID:riuna-due-${due.id}`);
    expect(body).toContain("SUMMARY:Vence: Entregar memoria");

    expect(body).not.toContain("Sin hora");
    expect(body).not.toContain(notMine.title);
  });

  it("anchors the 25th of October at its wall-clock hour", async () => {
    const { workspaceId, userId, task, createFeed, ics } = await setup();
    const day = new Date(2026, 9, 25);
    // Solo cae dentro de la ventana -un mes atras, tres adelante- hasta
    // finales de enero de 2027.
    if (Date.now() > new Date(2027, 0, 20).getTime()) return;

    const anchored = await task("Cambio de hora");
    await db.insert(schema.personalPlanEntryTable).values({
      workspaceId,
      userId,
      taskId: anchored.id,
      plannedDate: day,
      startMinute: 10 * 60,
    });

    const { token } = await createFeed();
    const body = await (await ics(token)).text();
    expect(body).toContain("DTSTART:20261025T090000Z");
  });

  it("stops serving the link when it is revoked, regenerated or its owner leaves the workspace", async () => {
    const { member, app, feedUrl, createFeed, ics } = await setup();

    const first = await createFeed();
    expect((await ics(first.token)).status).toBe(200);

    const second = await createFeed();
    expect((await ics(first.token)).status).toBe(404);
    expect((await ics(second.token)).status).toBe(200);

    await app.request(feedUrl, { method: "DELETE" });
    expect((await ics(second.token)).status).toBe(404);

    const third = await createFeed();
    expect((await ics(third.token)).status).toBe(200);
    await db
      .delete(schema.workspaceUserTable)
      .where(
        and(
          eq(schema.workspaceUserTable.workspaceId, member.workspace.id),
          eq(schema.workspaceUserTable.userId, member.user.id),
        ),
      );
    expect((await ics(third.token)).status).toBe(404);

    expect((await ics("no-es-un-token")).status).toBe(404);
  });

  it("keeps each workspace's feed apart", async () => {
    const here = await setup();
    const other = await createWorkspaceMember({
      role: "member",
      user: here.member.user,
    });
    const { project } = await createProjectFixture({
      workspaceId: other.workspace.id,
    });
    const [elsewhere] = await db
      .insert(schema.taskTable)
      .values({
        ...taskTreeValues(),
        projectId: project.id,
        title: "Del otro espacio",
        status: "to-do",
        priority: "medium",
        number: 1,
        userId: here.userId,
      })
      .returning();
    await db.insert(schema.personalPlanEntryTable).values({
      workspaceId: other.workspace.id,
      userId: here.userId,
      taskId: elsewhere.id,
      plannedDate: dayFromNow(1),
      startMinute: 9 * 60,
    });

    const { token } = await here.createFeed();
    const body = await (await here.ics(token)).text();
    expect(body).toContain("BEGIN:VCALENDAR");
    expect(body).not.toContain("Del otro espacio");
  });

  it("refuses to manage the link with an API key", async () => {
    const { member, workspaceId } = await setup();
    const plainKey = `riuna_${randomUUID()}`;
    const hashed = createHash("sha256")
      .update(plainKey)
      .digest("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=/g, "");
    await db.insert(schema.apikeyTable).values({
      id: `apikey-${randomUUID()}`,
      name: "Script",
      key: hashed,
      userId: member.user.id,
      referenceId: member.user.id,
      enabled: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const { app } = createApp();

    const response = await app.request(
      `/api/calendar/feed?workspaceId=${workspaceId}`,
      { method: "POST", headers: { "x-api-key": plainKey } },
    );
    expect(response.status).toBe(403);
    expect(await db.select().from(schema.calendarFeedTable)).toEqual([]);
  });
});
