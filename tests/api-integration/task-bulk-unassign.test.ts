import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import db, { schema } from "../../apps/api/src/database";
import { settleEvents } from "../../apps/api/src/events";
import { createApp } from "../../apps/api/src/index";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
  taskTreeValues,
} from "./helpers/fixtures";

beforeEach(async () => {
  await resetTestDatabase();
});

describe("PATCH /task/bulk updateAssignee (auditoria 1.3)", () => {
  it("records who was unassigned, as the single unassign does", async () => {
    const { user, workspace } = await createWorkspaceMember({ role: "owner" });
    const { project } = await createProjectFixture({
      workspaceId: workspace.id,
    });
    const [task] = await db
      .insert(schema.taskTable)
      .values({
        ...taskTreeValues(),
        projectId: project.id,
        title: "Asignada",
        status: "to-do",
        priority: "medium",
        number: 1,
        position: 0,
        userId: user.id,
      })
      .returning();
    if (!task) throw new Error("seed");
    await db
      .insert(schema.taskAssigneeTable)
      .values({ taskId: task.id, userId: user.id });

    mockAuthenticatedSession(user);
    const response = await createApp().app.request("/api/task/bulk", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        taskIds: [task.id],
        operation: "updateAssignee",
        value: null,
      }),
    });
    expect(response.status).toBe(200);
    await settleEvents();

    const [activity] = await db
      .select()
      .from(schema.activityTable)
      .where(
        and(
          eq(schema.activityTable.taskId, task.id),
          eq(schema.activityTable.type, "unassigned"),
        ),
      );
    expect(activity?.eventData).toMatchObject({ previousAssigneeId: user.id });
  });
});
