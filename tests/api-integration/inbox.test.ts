import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { ensureInbox } from "../../apps/api/src/capture/inbox";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
  taskTreeValues,
} from "./helpers/fixtures";

type Project = typeof schema.projectTable.$inferSelect;

async function addMember(workspaceId: string, name: string, role = "member") {
  const userId = `user-${randomUUID()}`;
  const [user] = await db
    .insert(schema.userTable)
    .values({
      id: userId,
      email: `${userId}@example.com`,
      emailVerified: true,
      name,
    })
    .returning();

  await db.insert(schema.workspaceUserTable).values({
    workspaceId,
    userId: user.id,
    role,
    joinedAt: new Date(),
  });

  return user;
}

async function postInbox(workspaceId: string) {
  const { app } = createApp();
  return app.request("/api/capture/inbox", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workspaceId }),
  });
}

async function listProjects(workspaceId: string, includeArchived = false) {
  const { app } = createApp();
  const response = await app.request(
    `/api/project?workspaceId=${workspaceId}${includeArchived ? "&includeArchived=true" : ""}`,
  );
  expect(response.status).toBe(200);
  return (await response.json()) as Project[];
}

async function seedTask(projectId: string, title: string) {
  const [task] = await db
    .insert(schema.taskTable)
    .values({
      ...taskTreeValues(),
      projectId,
      title,
      status: "to-do",
      number: 1,
    })
    .returning();
  return task;
}

async function readProject(id: string) {
  const [project] = await db
    .select()
    .from(schema.projectTable)
    .where(eq(schema.projectTable.id, id));
  return project;
}

describe("API integration: inbox (ADR 051)", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  it("does not exist until first use, then is created once with its columns", async () => {
    const member = await createWorkspaceMember({ userName: "Ana" });
    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const before = await app.request(
      `/api/capture/inbox?workspaceId=${member.workspace.id}`,
    );
    expect(before.status).toBe(200);
    expect(await before.json()).toEqual({ inbox: null });

    const created = await postInbox(member.workspace.id);
    expect(created.status).toBe(200);
    const { inbox } = (await created.json()) as { inbox: Project };
    expect(inbox).toMatchObject({
      name: "Bandeja de Ana",
      slug: "BAN",
      icon: "Inbox",
      ownerUserId: member.user.id,
      workspaceId: member.workspace.id,
    });

    const columns = await db
      .select()
      .from(schema.columnTable)
      .where(eq(schema.columnTable.projectId, inbox.id));
    expect(columns.map((column) => column.slug).sort()).toEqual(
      ["done", "in-progress", "in-review", "to-do"].sort(),
    );

    const again = (await (await postInbox(member.workspace.id)).json()) as {
      inbox: Project;
    };
    expect(again.inbox.id).toBe(inbox.id);

    const after = await app.request(
      `/api/capture/inbox?workspaceId=${member.workspace.id}`,
    );
    expect(((await after.json()) as { inbox: Project }).inbox.id).toBe(
      inbox.id,
    );
  });

  it("creates a single inbox when two captures race", async () => {
    const member = await createWorkspaceMember();

    const results = await Promise.all(
      Array.from({ length: 6 }, () =>
        ensureInbox(member.workspace.id, member.user.id),
      ),
    );

    expect(new Set(results.map((inbox) => inbox?.id)).size).toBe(1);

    const inboxes = await db
      .select()
      .from(schema.projectTable)
      .where(eq(schema.projectTable.ownerUserId, member.user.id));
    expect(inboxes).toHaveLength(1);
  });

  it("keeps one inbox per person and workspace", async () => {
    const ana = await createWorkspaceMember({ userName: "Ana" });
    const luis = await addMember(ana.workspace.id, "Luis");
    const other = await createWorkspaceMember({ user: ana.user });

    const anaHere = await ensureInbox(ana.workspace.id, ana.user.id);
    const luisHere = await ensureInbox(ana.workspace.id, luis.id);
    const anaThere = await ensureInbox(other.workspace.id, ana.user.id);

    expect(new Set([anaHere?.id, luisHere?.id, anaThere?.id]).size).toBe(3);
    expect(luisHere?.name).toBe("Bandeja de Luis");
    expect(anaThere?.workspaceId).toBe(other.workspace.id);

    // La base impone el maximo aunque alguien escriba sin `ensureInbox`.
    await expect(
      db.insert(schema.projectTable).values({
        workspaceId: ana.workspace.id,
        ownerUserId: ana.user.id,
        name: "Otra",
        slug: "OTR",
      }),
    ).rejects.toThrow();
  });

  it("hides inboxes from project lists and project search, for everyone", async () => {
    const ana = await createWorkspaceMember({ userName: "Ana", role: "owner" });
    const luis = await addMember(ana.workspace.id, "Luis");
    const { project } = await createProjectFixture({
      workspaceId: ana.workspace.id,
      name: "Bandeja de entrada de clientes",
    });
    await ensureInbox(ana.workspace.id, ana.user.id);
    await ensureInbox(ana.workspace.id, luis.id);

    for (const user of [ana.user, luis]) {
      mockAuthenticatedSession(user);

      expect((await listProjects(ana.workspace.id)).map((p) => p.id)).toEqual([
        project.id,
      ]);
      expect(
        (await listProjects(ana.workspace.id, true)).map((p) => p.id),
      ).toEqual([project.id]);

      const { app } = createApp();
      const search = await app.request(
        `/api/search?q=bandeja&type=projects&workspaceId=${ana.workspace.id}`,
      );
      expect(search.status).toBe(200);
      const { results } = (await search.json()) as {
        results: { id: string }[];
      };
      expect(results.map((result) => result.id)).toEqual([project.id]);
    }
  });

  it("is hidden, not private: another member reads it and finds its tasks", async () => {
    const ana = await createWorkspaceMember({ userName: "Ana" });
    const luis = await addMember(ana.workspace.id, "Luis");
    const inbox = await ensureInbox(ana.workspace.id, ana.user.id);
    if (!inbox) throw new Error("inbox not created");
    const task = await seedTask(inbox.id, "Llamar al proveedor de toner");

    mockAuthenticatedSession(luis);
    const { app } = createApp();

    const project = await app.request(`/api/project/${inbox.id}`);
    expect(project.status).toBe(200);

    const search = await app.request(
      `/api/search?q=toner&type=tasks&workspaceId=${ana.workspace.id}`,
    );
    const { results } = (await search.json()) as { results: { id: string }[] };
    expect(results.map((result) => result.id)).toContain(task.id);
  });

  it("leaves the reorder answer without inboxes and keeps their rank", async () => {
    const ana = await createWorkspaceMember({ role: "owner" });
    const { project: first } = await createProjectFixture({
      workspaceId: ana.workspace.id,
    });
    const inbox = await ensureInbox(ana.workspace.id, ana.user.id);
    const { project: second } = await createProjectFixture({
      workspaceId: ana.workspace.id,
    });

    mockAuthenticatedSession(ana.user);
    const { app } = createApp();
    const response = await app.request(
      `/api/project/reorder?workspaceId=${ana.workspace.id}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projects: [
            { id: second.id, position: 0 },
            { id: first.id, position: 1 },
          ],
        }),
      },
    );

    expect(response.status).toBe(200);
    const reordered = (await response.json()) as Project[];
    expect(reordered.map((p) => p.id)).toEqual([second.id, first.id]);
    expect(await readProject(inbox?.id ?? "")).toBeDefined();
  });

  it("refuses to create an inbox for someone who cannot create tasks", async () => {
    const viewer = await createWorkspaceMember({ role: "viewer" });
    mockAuthenticatedSession(viewer.user);

    const response = await postInbox(viewer.workspace.id);

    expect(response.status).toBe(403);
    const inboxes = await db
      .select()
      .from(schema.projectTable)
      .where(eq(schema.projectTable.ownerUserId, viewer.user.id));
    expect(inboxes).toHaveLength(0);
  });

  it("does not hand out an inbox in a workspace the caller is not in", async () => {
    const ana = await createWorkspaceMember();
    const stranger = await createWorkspaceMember();
    mockAuthenticatedSession(stranger.user);

    const response = await postInbox(ana.workspace.id);

    expect(response.status).toBe(403);
  });

  it("becomes a normal project, tasks included, when the person leaves the workspace", async () => {
    const ana = await createWorkspaceMember({ userName: "Ana" });
    const luis = await addMember(ana.workspace.id, "Luis", "owner");
    const inbox = await ensureInbox(ana.workspace.id, ana.user.id);
    if (!inbox) throw new Error("inbox not created");
    const task = await seedTask(inbox.id, "Pendiente de Ana");
    // Su Bandeja en otro espacio no se toca.
    const elsewhere = await createWorkspaceMember({ user: ana.user });
    const otherInbox = await ensureInbox(elsewhere.workspace.id, ana.user.id);

    await db
      .delete(schema.workspaceUserTable)
      .where(
        and(
          eq(schema.workspaceUserTable.workspaceId, ana.workspace.id),
          eq(schema.workspaceUserTable.userId, ana.user.id),
        ),
      );

    expect((await readProject(inbox.id)).ownerUserId).toBeNull();
    expect((await readProject(otherInbox?.id ?? "")).ownerUserId).toBe(
      ana.user.id,
    );

    mockAuthenticatedSession(luis);
    expect((await listProjects(ana.workspace.id)).map((p) => p.id)).toContain(
      inbox.id,
    );
    const [kept] = await db
      .select()
      .from(schema.taskTable)
      .where(eq(schema.taskTable.id, task.id));
    expect(kept?.projectId).toBe(inbox.id);
  });

  it("becomes a normal project when the person is deleted", async () => {
    const ana = await createWorkspaceMember({ userName: "Ana" });
    const luis = await addMember(ana.workspace.id, "Luis", "owner");
    const inbox = await ensureInbox(ana.workspace.id, ana.user.id);
    if (!inbox) throw new Error("inbox not created");
    await seedTask(inbox.id, "Pendiente de Ana");

    await db
      .delete(schema.userTable)
      .where(eq(schema.userTable.id, ana.user.id));

    const released = await readProject(inbox.id);
    expect(released.ownerUserId).toBeNull();
    expect(released.name).toBe("Bandeja de Ana");

    mockAuthenticatedSession(luis);
    expect((await listProjects(ana.workspace.id)).map((p) => p.id)).toContain(
      inbox.id,
    );
  });

  it("goes away with its workspace", async () => {
    const ana = await createWorkspaceMember();
    const inbox = await ensureInbox(ana.workspace.id, ana.user.id);
    if (!inbox) throw new Error("inbox not created");
    await seedTask(inbox.id, "Se va con el espacio");

    await db
      .delete(schema.workspaceTable)
      .where(eq(schema.workspaceTable.id, ana.workspace.id));

    expect(await readProject(inbox.id)).toBeUndefined();
  });
});
