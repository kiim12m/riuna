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

type User = typeof schema.userTable.$inferSelect;
type Announcement = {
  id: string;
  title: string;
  projectId: string | null;
  pinned: boolean;
  pinnedNow: boolean;
  notified: boolean;
  author: { id: string; name: string | null } | null;
};

const DAY = 24 * 60 * 60 * 1000;

async function send(user: User, method: string, path: string, body?: unknown) {
  mockAuthenticatedSession(user);
  return createApp().app.request(path, {
    method,
    headers: { "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function ok<T>(response: Response) {
  if (response.status !== 200) {
    throw new Error(`${response.status} ${await response.text()}`);
  }
  return response.json() as Promise<T>;
}

async function notified(announcementId: string) {
  await settleEvents();
  const rows = await db
    .select({ userId: schema.notificationTable.userId })
    .from(schema.notificationTable)
    .where(
      and(
        eq(schema.notificationTable.resourceId, announcementId),
        eq(schema.notificationTable.type, "announcement_published"),
      ),
    );
  return rows.map((row) => row.userId).sort();
}

async function setup() {
  const ana = await createWorkspaceMember({ userName: "Ana", role: "admin" });
  const ws = ana.workspace.id;
  const luis = await addWorkspaceMember(ws, "member");
  const marta = await addWorkspaceMember(ws, "member");
  const { project } = await createProjectFixture({ workspaceId: ws });
  return { ana: ana.user, luis, marta, ws, project };
}

describe("API integration: announcements (ADR 081)", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  it("publishes a project announcement and notifies everyone but the author", async () => {
    const { ana, luis, marta, project } = await setup();

    const created = await ok<Announcement>(
      await send(ana, "POST", `/api/announcement/project/${project.id}`, {
        title: "Corte de luz el jueves",
        content: "De 8:00 a 10:00.",
      }),
    );
    expect(created).toMatchObject({
      title: "Corte de luz el jueves",
      projectId: project.id,
      notified: true,
      author: { id: ana.id, name: "Ana" },
    });
    expect(await notified(created.id)).toEqual([luis.id, marta.id].sort());

    const list = await ok<Announcement[]>(
      await send(luis, "GET", `/api/announcement/project/${project.id}`),
    );
    expect(list.map((item) => item.id)).toEqual([created.id]);
  });

  it("can stay quiet, and editing never notifies again", async () => {
    const { ana, project } = await setup();
    const quiet = await ok<Announcement>(
      await send(ana, "POST", `/api/announcement/project/${project.id}`, {
        title: "Nota interna",
        notify: false,
      }),
    );
    expect(quiet.notified).toBe(false);

    await ok(
      await send(ana, "PUT", `/api/announcement/${quiet.id}`, {
        title: "Nota interna, corregida",
      }),
    );
    expect(await notified(quiet.id)).toEqual([]);
  });

  it("lets only who can configure the project or the workspace publish", async () => {
    const { luis, ws, project } = await setup();

    const project403 = await send(
      luis,
      "POST",
      `/api/announcement/project/${project.id}`,
      { title: "No" },
    );
    expect(project403.status).toBe(403);

    const workspace403 = await send(
      luis,
      "POST",
      `/api/announcement/workspace/${ws}`,
      { title: "No" },
    );
    expect(workspace403.status).toBe(403);
  });

  it("shows the newest pinned one in force as the project's banner", async () => {
    const { ana, luis, ws, project } = await setup();

    const workspaceWide = await ok<Announcement>(
      await send(ana, "POST", `/api/announcement/workspace/${ws}`, {
        title: "Cambio de horario",
        pinned: true,
        notify: false,
      }),
    );
    let pinned = await ok<Announcement | null>(
      await send(luis, "GET", `/api/announcement/project/${project.id}/pinned`),
    );
    expect(pinned?.id).toBe(workspaceWide.id);

    const expired = await ok<Announcement>(
      await send(ana, "POST", `/api/announcement/project/${project.id}`, {
        title: "Ya pasó",
        pinned: true,
        pinnedUntil: new Date(Date.now() - DAY).toISOString(),
        notify: false,
      }),
    );
    expect(expired.pinnedNow).toBe(false);
    pinned = await ok<Announcement | null>(
      await send(luis, "GET", `/api/announcement/project/${project.id}/pinned`),
    );
    expect(pinned?.id).toBe(workspaceWide.id);

    const current = await ok<Announcement>(
      await send(ana, "POST", `/api/announcement/project/${project.id}`, {
        title: "Corte de luz",
        pinned: true,
        pinnedUntil: new Date(Date.now() + DAY).toISOString(),
        notify: false,
      }),
    );
    pinned = await ok<Announcement | null>(
      await send(luis, "GET", `/api/announcement/project/${project.id}/pinned`),
    );
    expect(pinned?.id).toBe(current.id);

    await ok(await send(ana, "DELETE", `/api/announcement/${current.id}`));
    pinned = await ok<Announcement | null>(
      await send(luis, "GET", `/api/announcement/project/${project.id}/pinned`),
    );
    expect(pinned?.id).toBe(workspaceWide.id);
  });

  it("keeps the workspace board and each project's apart", async () => {
    const { ana, luis, ws, project } = await setup();
    const own = await ok<Announcement>(
      await send(ana, "POST", `/api/announcement/workspace/${ws}`, {
        title: "Del espacio",
        notify: false,
      }),
    );
    await ok(
      await send(ana, "POST", `/api/announcement/project/${project.id}`, {
        title: "Del proyecto",
        notify: false,
      }),
    );

    const board = await ok<Announcement[]>(
      await send(luis, "GET", `/api/announcement/workspace/${ws}`),
    );
    expect(board.map((item) => item.id)).toEqual([own.id]);
  });

  it("has no announcements in a personal project, and hides others' workspaces", async () => {
    const { ana, ws } = await setup();
    const [personal] = await db
      .insert(schema.projectTable)
      .values({
        workspaceId: ws,
        name: "Personal",
        icon: "Inbox",
        slug: `personal-${ana.id}`,
        ownerUserId: ana.id,
      })
      .returning();
    if (!personal) throw new Error("Failed to seed the personal project");

    const response = await send(
      ana,
      "POST",
      `/api/announcement/project/${personal.id}`,
      { title: "No" },
    );
    expect(response.status).toBe(400);

    const outsider = await createWorkspaceMember({ userName: "Fuera" });
    const denied = await send(
      outsider.user,
      "GET",
      `/api/announcement/workspace/${ws}`,
    );
    expect(denied.status).toBe(403);
  });
});
