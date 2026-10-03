import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";

type Captured = {
  task: { id: string; projectId: string; number: number };
  projectSlug: string;
  inInbox: boolean;
};

async function capture(body: Record<string, unknown>) {
  const { app } = createApp();
  return app.request("/api/capture", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function readTask(id: string) {
  const [task] = await db
    .select()
    .from(schema.taskTable)
    .where(eq(schema.taskTable.id, id));
  return task;
}

async function planEntryOf(taskId: string) {
  const [entry] = await db
    .select()
    .from(schema.personalPlanEntryTable)
    .where(eq(schema.personalPlanEntryTable.taskId, taskId));
  return entry;
}

async function taskCount() {
  return (await db.select().from(schema.taskTable)).length;
}

async function workspaceLabel(workspaceId: string, name: string) {
  const [label] = await db
    .insert(schema.labelTable)
    .values({ name, color: "blue", workspaceId })
    .returning();
  return label;
}

describe("API integration: quick capture (ADR 052)", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  it("lands in the caller's inbox, assigned to them, creating the inbox on first use", async () => {
    const member = await createWorkspaceMember({ userName: "Ana" });
    mockAuthenticatedSession(member.user);

    const response = await capture({
      workspaceId: member.workspace.id,
      title: "  Llamar al proveedor  ",
    });

    expect(response.status).toBe(200);
    const captured = (await response.json()) as Captured;
    expect(captured.inInbox).toBe(true);
    expect(captured.projectSlug).toBe("PER");

    const task = await readTask(captured.task.id);
    expect(task.title).toBe("Llamar al proveedor");
    expect(task.userId).toBe(member.user.id);
    expect(task.status).toBe("to-do");
    expect(task.dueDate).toBeNull();
    expect(task.number).toBe(1);

    const [inbox] = await db
      .select()
      .from(schema.projectTable)
      .where(eq(schema.projectTable.id, task.projectId));
    expect(inbox.ownerUserId).toBe(member.user.id);

    const assignees = await db
      .select()
      .from(schema.taskAssigneeTable)
      .where(eq(schema.taskAssigneeTable.taskId, task.id));
    expect(assignees.map((row) => row.userId)).toEqual([member.user.id]);
    expect(await planEntryOf(task.id)).toBeUndefined();
  });

  it("plans the day and the anchored time without touching the due date", async () => {
    const member = await createWorkspaceMember();
    mockAuthenticatedSession(member.user);

    const response = await capture({
      workspaceId: member.workspace.id,
      title: "Revisar presupuesto",
      plannedDate: "2026-10-26",
      startMinute: 600,
    });

    expect(response.status).toBe(200);
    const { task } = (await response.json()) as Captured;
    expect((await readTask(task.id)).dueDate).toBeNull();

    const entry = await planEntryOf(task.id);
    expect(entry?.userId).toBe(member.user.id);
    expect(entry?.startMinute).toBe(600);
    // Medianoche de Madrid del dia pedido, el dia despues del cambio de hora.
    expect(entry?.plannedDate.getFullYear()).toBe(2026);
    expect(entry?.plannedDate.getMonth()).toBe(9);
    expect(entry?.plannedDate.getDate()).toBe(26);
    expect(entry?.plannedDate.getHours()).toBe(0);
  });

  it("sets the due day, estimate and priority, and no plan entry", async () => {
    const member = await createWorkspaceMember();
    mockAuthenticatedSession(member.user);

    const response = await capture({
      workspaceId: member.workspace.id,
      title: "Entregar informe",
      dueDate: "2026-11-03",
      estimate: 5400,
      priority: "high",
    });

    expect(response.status).toBe(200);
    const { task } = (await response.json()) as Captured;
    const stored = await readTask(task.id);
    expect(stored.estimate).toBe(5400);
    expect(stored.priority).toBe("high");
    expect(stored.dueDate?.getDate()).toBe(3);
    expect(stored.dueDate?.getMonth()).toBe(10);
    expect(stored.dueDate?.getHours()).toBe(0);
    expect(await planEntryOf(task.id)).toBeUndefined();
  });

  it("goes to the given project, starting in its first open column", async () => {
    const member = await createWorkspaceMember();
    const { project } = await createProjectFixture({
      workspaceId: member.workspace.id,
      slug: "OBR",
    });
    // Un proyecto cuyo flujo ya no tiene "to-do".
    await db
      .update(schema.columnTable)
      .set({ position: 10 })
      .where(
        and(
          eq(schema.columnTable.projectId, project.id),
          eq(schema.columnTable.slug, "to-do"),
        ),
      );
    mockAuthenticatedSession(member.user);

    const response = await capture({
      workspaceId: member.workspace.id,
      title: "Medir cuadro",
      projectId: project.id,
    });

    expect(response.status).toBe(200);
    const captured = (await response.json()) as Captured;
    expect(captured).toMatchObject({ projectSlug: "OBR", inInbox: false });
    const stored = await readTask(captured.task.id);
    expect(stored.projectId).toBe(project.id);
    expect(stored.status).toBe("in-progress");

    const inboxes = await db
      .select()
      .from(schema.projectTable)
      .where(eq(schema.projectTable.ownerUserId, member.user.id));
    expect(inboxes).toHaveLength(0);
  });

  it("attaches workspace labels", async () => {
    const member = await createWorkspaceMember();
    const urgent = await workspaceLabel(member.workspace.id, "Urgente");
    const client = await workspaceLabel(member.workspace.id, "Cliente");
    mockAuthenticatedSession(member.user);

    const response = await capture({
      workspaceId: member.workspace.id,
      title: "Responder correo",
      labelIds: [urgent.id, client.id, urgent.id],
    });

    expect(response.status).toBe(200);
    const { task } = (await response.json()) as Captured;
    const attached = await db
      .select()
      .from(schema.labelTable)
      .where(eq(schema.labelTable.taskId, task.id));
    expect(attached.map((label) => label.name).sort()).toEqual([
      "Cliente",
      "Urgente",
    ]);

    // Las del espacio siguen ahi: se copian, no se mueven.
    const stillWorkspace = await db
      .select()
      .from(schema.labelTable)
      .where(eq(schema.labelTable.id, urgent.id));
    expect(stillWorkspace[0]?.taskId).toBeNull();
  });

  it("creates nothing when a label is foreign or already hangs from a task", async () => {
    const member = await createWorkspaceMember();
    const other = await createWorkspaceMember();
    const foreign = await workspaceLabel(other.workspace.id, "Ajena");
    mockAuthenticatedSession(member.user);

    const foreignResponse = await capture({
      workspaceId: member.workspace.id,
      title: "No deberia existir",
      labelIds: [foreign.id],
    });
    expect(foreignResponse.status).toBe(400);

    const first = (await (
      await capture({ workspaceId: member.workspace.id, title: "Primera" })
    ).json()) as Captured;
    const own = await workspaceLabel(member.workspace.id, "Propia");
    await db
      .update(schema.labelTable)
      .set({ taskId: first.task.id })
      .where(eq(schema.labelTable.id, own.id));

    const copyResponse = await capture({
      workspaceId: member.workspace.id,
      title: "Tampoco",
      labelIds: [own.id],
    });
    expect(copyResponse.status).toBe(400);
    expect(await taskCount()).toBe(1);
  });

  it("rejects a project of another workspace, a time without a day, and a blank title", async () => {
    const member = await createWorkspaceMember();
    const other = await createWorkspaceMember();
    const { project: foreign } = await createProjectFixture({
      workspaceId: other.workspace.id,
    });
    mockAuthenticatedSession(member.user);

    const responses = await Promise.all([
      capture({
        workspaceId: member.workspace.id,
        title: "Ajena",
        projectId: foreign.id,
      }),
      capture({
        workspaceId: member.workspace.id,
        title: "Sin dia",
        startMinute: 540,
      }),
      capture({ workspaceId: member.workspace.id, title: "   " }),
      capture({
        workspaceId: member.workspace.id,
        title: "Dia malo",
        plannedDate: "mañana",
      }),
    ]);

    expect(responses.map((response) => response.status)).toEqual([
      404, 400, 400, 400,
    ]);
    expect(await taskCount()).toBe(0);
  });

  it("refuses someone who cannot create tasks, or is not in the workspace", async () => {
    const viewer = await createWorkspaceMember({ role: "viewer" });
    mockAuthenticatedSession(viewer.user);
    expect(
      (await capture({ workspaceId: viewer.workspace.id, title: "Nada" }))
        .status,
    ).toBe(403);

    const stranger = await createWorkspaceMember();
    mockAuthenticatedSession(stranger.user);
    expect(
      (await capture({ workspaceId: viewer.workspace.id, title: "Nada" }))
        .status,
    ).toBe(403);

    expect(await taskCount()).toBe(0);
  });

  it("serves the day through GET /today right after a capture for today", async () => {
    const member = await createWorkspaceMember();
    mockAuthenticatedSession(member.user);
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

    const { task } = (await (
      await capture({
        workspaceId: member.workspace.id,
        title: `Para hoy ${randomUUID().slice(0, 4)}`,
        plannedDate: today,
      })
    ).json()) as Captured;

    const { app } = createApp();
    const response = await app.request(
      `/api/today?workspaceId=${member.workspace.id}`,
    );
    const body = (await response.json()) as { planned: { id: string }[] };
    expect(body.planned.map((row) => row.id)).toContain(task.id);
  });
});
