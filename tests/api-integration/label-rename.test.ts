import { and, eq, isNull } from "drizzle-orm";
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

type App = ReturnType<typeof createApp>["app"];

async function setup() {
  const { user, workspace } = await createWorkspaceMember({ role: "owner" });
  const { project } = await createProjectFixture({ workspaceId: workspace.id });
  const [task] = await db
    .insert(schema.taskTable)
    .values({
      ...taskTreeValues(),
      projectId: project.id,
      title: "Con etiquetas",
      status: "to-do",
      priority: "medium",
      number: 1,
      position: 0,
    })
    .returning();
  if (!task) throw new Error("seed");
  mockAuthenticatedSession(user);
  return { app: createApp().app, workspaceId: workspace.id, taskId: task.id };
}

async function insertLabel(
  workspaceId: string,
  name: string,
  taskId: string | null = null,
) {
  const [label] = await db
    .insert(schema.labelTable)
    .values({ workspaceId, name, color: "#111111", taskId })
    .returning();
  if (!label) throw new Error("seed");
  return label;
}

function rename(app: App, id: string, name: string) {
  return app.request(`/api/label/${id}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, color: "#222222" }),
  });
}

beforeEach(async () => {
  await resetTestDatabase();
});

describe("PUT /label/:id rename (auditoria 1.8)", () => {
  it("answers 409 when another workspace label already has the name", async () => {
    const { app, workspaceId } = await setup();
    const urgent = await insertLabel(workspaceId, "Urgente");
    await insertLabel(workspaceId, "Prioritario");

    const response = await rename(app, urgent.id, "Prioritario");

    expect(response.status).toBe(409);
    const [unchanged] = await db
      .select()
      .from(schema.labelTable)
      .where(eq(schema.labelTable.id, urgent.id));
    expect(unchanged?.name).toBe("Urgente");
  });

  it("merges the task copies when a task already carries the new name", async () => {
    const { app, workspaceId, taskId } = await setup();
    const urgent = await insertLabel(workspaceId, "Urgente");
    await insertLabel(workspaceId, "Urgente", taskId);
    await insertLabel(workspaceId, "Prioritario", taskId);

    const response = await rename(app, urgent.id, "Prioritario");

    expect(response.status).toBe(200);
    const copies = await db
      .select({ name: schema.labelTable.name, color: schema.labelTable.color })
      .from(schema.labelTable)
      .where(eq(schema.labelTable.taskId, taskId));
    expect(copies).toEqual([{ name: "Prioritario", color: "#222222" }]);
    const [definition] = await db
      .select()
      .from(schema.labelTable)
      .where(
        and(
          eq(schema.labelTable.workspaceId, workspaceId),
          isNull(schema.labelTable.taskId),
        ),
      );
    expect(definition?.name).toBe("Prioritario");
  });

  it("answers 409 when renaming a task label to a name the task already has", async () => {
    const { app, workspaceId, taskId } = await setup();
    const urgent = await insertLabel(workspaceId, "Urgente", taskId);
    await insertLabel(workspaceId, "Prioritario", taskId);

    const response = await rename(app, urgent.id, "Prioritario");

    expect(response.status).toBe(409);
  });
});
