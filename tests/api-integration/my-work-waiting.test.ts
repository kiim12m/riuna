import { randomUUID } from "node:crypto";
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

type Waiting = {
  delegated: { id: string }[];
  blocked: { id: string; blockedBy: { id: string; title: string }[] }[];
};

async function addMember(workspaceId: string, name: string) {
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
    role: "member",
    joinedAt: new Date(),
  });
  return user;
}

let number = 0;

async function task(
  projectId: string,
  title: string,
  { createdBy, assignees = [] }: { createdBy?: string; assignees?: string[] },
) {
  number += 1;
  const [row] = await db
    .insert(schema.taskTable)
    .values({
      ...taskTreeValues(),
      projectId,
      title,
      status: "to-do",
      priority: "medium",
      number,
      userId: assignees[0] ?? null,
    })
    .returning();
  for (const userId of assignees) {
    await db
      .insert(schema.taskAssigneeTable)
      .values({ taskId: row.id, userId });
  }
  if (createdBy) {
    await db
      .insert(schema.activityTable)
      .values({ taskId: row.id, type: "created", userId: createdBy });
  }
  return row;
}

async function blocks(sourceTaskId: string, targetTaskId: string) {
  await db
    .insert(schema.taskRelationTable)
    .values({ sourceTaskId, targetTaskId, relationType: "blocks" });
}

async function complete(taskId: string, doneColumnId: string) {
  await db
    .update(schema.taskTable)
    .set({ status: "done", columnId: doneColumnId })
    .where(eq(schema.taskTable.id, taskId));
}

async function waiting(user: typeof schema.userTable.$inferSelect, ws: string) {
  mockAuthenticatedSession(user);
  const { app } = createApp();
  const response = await app.request(`/api/my-work/waiting?workspaceId=${ws}`);
  expect(response.status).toBe(200);
  return (await response.json()) as Waiting;
}

describe("API integration: waiting on (sub-bloque 1.4)", () => {
  beforeEach(async () => {
    await resetTestDatabase();
    number = 0;
  });

  it("lists what I created and assigned to someone else, still open", async () => {
    const ana = await createWorkspaceMember({ userName: "Ana" });
    const luis = await addMember(ana.workspace.id, "Luis");
    const ws = ana.workspace.id;
    const { project, columns } = await createProjectFixture({
      workspaceId: ws,
    });

    const delegated = await task(project.id, "Delegada", {
      createdBy: ana.user.id,
      assignees: [luis.id],
    });
    await task(project.id, "Compartida conmigo", {
      createdBy: ana.user.id,
      assignees: [luis.id, ana.user.id],
    });
    await task(project.id, "Sin asignar", { createdBy: ana.user.id });
    await task(project.id, "De Luis", {
      createdBy: luis.id,
      assignees: [luis.id],
    });
    const finished = await task(project.id, "Ya hecha", {
      createdBy: ana.user.id,
      assignees: [luis.id],
    });
    await complete(finished.id, columns.done.id);
    const archived = await task(project.id, "Archivada", {
      createdBy: ana.user.id,
      assignees: [luis.id],
    });
    await db
      .update(schema.taskTable)
      .set({ status: "archived" })
      .where(eq(schema.taskTable.id, archived.id));

    const body = await waiting(ana.user, ws);

    expect(body.delegated.map((row) => row.id)).toEqual([delegated.id]);
  });

  it("lists my open tasks blocked by someone else's open task, with the blockers", async () => {
    const ana = await createWorkspaceMember({ userName: "Ana" });
    const luis = await addMember(ana.workspace.id, "Luis");
    const ws = ana.workspace.id;
    const { project, columns } = await createProjectFixture({
      workspaceId: ws,
    });

    const mine = await task(project.id, "Montar cuadro", {
      assignees: [ana.user.id],
    });
    const blocker = await task(project.id, "Pedir material", {
      assignees: [luis.id],
    });
    await blocks(blocker.id, mine.id);

    // Bloqueada por algo mio: no espero a nadie.
    const selfBlocked = await task(project.id, "Mia bloqueada por mi", {
      assignees: [ana.user.id],
    });
    const ownBlocker = await task(project.id, "Lo hago yo antes", {
      assignees: [ana.user.id],
    });
    await blocks(ownBlocker.id, selfBlocked.id);

    // El bloqueo ya terminado no cuenta.
    const unblocked = await task(project.id, "Ya desbloqueada", {
      assignees: [ana.user.id],
    });
    const doneBlocker = await task(project.id, "Hecha por Luis", {
      assignees: [luis.id],
    });
    await blocks(doneBlocker.id, unblocked.id);
    await complete(doneBlocker.id, columns.done.id);

    // La relacion al reves: lo mio bloquea lo de Luis.
    const luisTask = await task(project.id, "Espera a Ana", {
      assignees: [luis.id],
    });
    await blocks(mine.id, luisTask.id);

    const body = await waiting(ana.user, ws);

    expect(body.blocked.map((row) => row.id)).toEqual([mine.id]);
    expect(body.blocked[0].blockedBy).toEqual([
      expect.objectContaining({ id: blocker.id, title: "Pedir material" }),
    ]);

    // Y Luis ve lo suyo bloqueado por Ana.
    const luisView = await waiting(luis, ws);
    expect(luisView.blocked.map((row) => row.id)).toEqual([luisTask.id]);
  });

  it("stays inside the workspace, also for blockers", async () => {
    const ana = await createWorkspaceMember({ userName: "Ana" });
    const luis = await addMember(ana.workspace.id, "Luis");
    const { project } = await createProjectFixture({
      workspaceId: ana.workspace.id,
    });

    const other = await createWorkspaceMember({ user: ana.user });
    const outsider = await addMember(other.workspace.id, "Marta");
    const { project: otherProject } = await createProjectFixture({
      workspaceId: other.workspace.id,
    });
    await task(otherProject.id, "Delegada en otro espacio", {
      createdBy: ana.user.id,
      assignees: [outsider.id],
    });
    const mine = await task(project.id, "Mia", { assignees: [ana.user.id] });
    const foreignBlocker = await task(otherProject.id, "Secreto de otro", {
      assignees: [outsider.id],
    });
    await blocks(foreignBlocker.id, mine.id);
    void luis;

    const body = await waiting(ana.user, ana.workspace.id);

    expect(body.delegated).toEqual([]);
    expect(body.blocked).toEqual([]);
  });

  it("refuses a workspace the caller is not in", async () => {
    const ana = await createWorkspaceMember();
    const stranger = await createWorkspaceMember();
    mockAuthenticatedSession(stranger.user);
    const { app } = createApp();

    const response = await app.request(
      `/api/my-work/waiting?workspaceId=${ana.workspace.id}`,
    );

    expect(response.status).toBe(403);
  });
});
