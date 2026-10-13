import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import db, { schema } from "../../apps/api/src/database";
import { settleEvents } from "../../apps/api/src/events";
import { createApp } from "../../apps/api/src/index";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import {
  addWorkspaceMember,
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";

// Octubre de 2026; el lunes 12 es festivo del espacio.
const day = (date: number) => new Date(2026, 9, date).toISOString();

async function setup() {
  const ana = await createWorkspaceMember({ userName: "Ana", role: "admin" });
  const luis = await addWorkspaceMember(ana.workspace.id, "member");
  const { project } = await createProjectFixture({
    workspaceId: ana.workspace.id,
  });
  await db.insert(schema.workspaceHolidayTable).values({
    workspaceId: ana.workspace.id,
    day: new Date(2026, 9, 12),
    name: "Hispanidad",
  });
  mockAuthenticatedSession(ana.user);
  const app = createApp().app;
  const send = (method: string, path: string, body?: unknown) =>
    app.request(path, {
      method,
      headers: { "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  const status = (body: Record<string, unknown>, projectId = project.id) =>
    send("PATCH", `/api/project/${projectId}/status`, body);
  return { ana, luis, project, app, send, status };
}

describe("API integration: project status (ADR 087)", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  it("keeps the health, its note, the dates and the lead, and their history", async () => {
    const { luis, project, send, status } = await setup();

    const response = await status({
      health: "at_risk",
      note: "  El cuadro general llega tarde  ",
      startDate: day(6),
      endDate: day(30),
      leadUserId: luis.id,
    });
    expect(response.status).toBe(200);
    const updated = await response.json();
    expect(updated).toMatchObject({
      health: "at_risk",
      healthNote: "El cuadro general llega tarde",
      leadUserId: luis.id,
    });

    // Solo cambia lo que llega.
    await status({ endDate: day(31) });
    await settleEvents();

    const activity = await (
      await send("GET", `/api/project/${project.id}/activity`)
    ).json();
    type Entry = { type: string; eventData: Record<string, unknown> };
    const [latest, ...first] = activity as Entry[];
    // Lo ultimo, primero: el cambio de fin.
    expect(latest?.type).toBe("dates_changed");
    expect(latest?.eventData).toMatchObject({
      from: { end: day(30) },
      to: { end: day(31) },
    });
    // El primer cambio deja una fila por cosa, en el mismo instante.
    expect(first.map((entry) => entry.type).sort()).toEqual([
      "dates_changed",
      "health_changed",
      "lead_changed",
    ]);
    expect(
      first.find((entry) => entry.type === "health_changed")?.eventData,
    ).toEqual({
      from: "not_started",
      to: "at_risk",
      note: "El cuadro general llega tarde",
    });
  });

  it("announces a change of health to the workspace only when asked to", async () => {
    const { ana, luis, project, status } = await setup();
    const notices = async () => {
      await settleEvents();
      return db
        .select()
        .from(schema.notificationTable)
        .where(eq(schema.notificationTable.type, "project_health_changed"));
    };

    await status({ health: "on_track" });
    expect(await notices()).toEqual([]);

    await status({ health: "off_track", note: "Sin licencia", notify: true });
    const sent = await notices();
    expect(sent.map((notice) => notice.userId)).toEqual([luis.id]);
    expect(sent[0]?.eventData).toMatchObject({
      projectId: project.id,
      health: "off_track",
      note: "Sin licencia",
    });
    expect(sent.map((notice) => notice.userId)).not.toContain(ana.user.id);

    // Retocar la nota no es noticia.
    await status({ note: "Licencia pedida", notify: true });
    expect(await notices()).toHaveLength(1);
  });

  it("refuses what does not make sense", async () => {
    const { ana, status } = await setup();
    const stranger = await createWorkspaceMember({ userName: "Otra" });

    expect((await status({ leadUserId: stranger.user.id })).status).toBe(400);
    expect(
      (await status({ startDate: day(20), endDate: day(10) })).status,
    ).toBe(400);

    const [personal] = await db
      .insert(schema.projectTable)
      .values({
        workspaceId: ana.workspace.id,
        name: "Personal",
        slug: "personal",
        ownerUserId: ana.user.id,
      })
      .returning();
    expect((await status({ health: "on_track" }, personal?.id)).status).toBe(
      400,
    );
  });

  it("only lets those who can configure the project change it", async () => {
    const { luis, project } = await setup();
    mockAuthenticatedSession(luis);
    const response = await createApp().app.request(
      `/api/project/${project.id}/status`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ health: "on_track" }),
      },
    );
    expect(response.status).toBe(403);
  });

  it("warns in the list when the tasks end after the project", async () => {
    const { ana, project, send, status } = await setup();
    await status({ endDate: day(9) });
    // El viernes 9 acaba el proyecto; la tarea, el martes 13: el lunes 12 es
    // festivo, asi que solo cuenta el martes.
    await send("POST", `/api/task/${project.id}`, {
      title: "Cuadro",
      description: "",
      priority: "medium",
      status: "to-do",
      dueDate: day(13),
    });
    const archived = await send("POST", `/api/task/${project.id}`, {
      title: "Archivada",
      description: "",
      priority: "medium",
      status: "to-do",
      dueDate: day(30),
    });
    const archivedId = (await archived.json()).id;
    await db
      .update(schema.taskTable)
      .set({ status: "archived" })
      .where(
        and(
          eq(schema.taskTable.id, archivedId),
          eq(schema.taskTable.projectId, project.id),
        ),
      );

    const projects = await (
      await send("GET", `/api/project?workspaceId=${ana.workspace.id}`)
    ).json();
    const listed = projects.find(
      (entry: { id: string }) => entry.id === project.id,
    );
    expect(listed.schedule).toEqual({
      tasksDueDate: day(13),
      overflowWorkDays: 1,
    });

    const single = await (
      await send("GET", `/api/project/${project.id}`)
    ).json();
    expect(single.schedule).toEqual(listed.schedule);
  });
});
