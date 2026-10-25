import { asc, eq } from "drizzle-orm";
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

function asUser(user: typeof schema.userTable.$inferSelect): App {
  mockAuthenticatedSession(user);
  return createApp().app;
}

beforeEach(async () => {
  await resetTestDatabase();
});

describe("DELETE /column/:id (auditoria 1.7)", () => {
  it("refuses to delete a column whose tasks only point at it by status", async () => {
    const { user, workspace } = await createWorkspaceMember({ role: "owner" });
    const { project, columns } = await createProjectFixture({
      workspaceId: workspace.id,
    });
    // Sin `column_id`, como las que dejaban las importaciones y la API vieja:
    // la columna solo se reconoce por el `status`.
    await db.insert(schema.taskTable).values({
      ...taskTreeValues(),
      projectId: project.id,
      title: "Solo por estado",
      status: columns.inReview.slug,
      columnId: null,
      priority: "medium",
      number: 1,
      position: 0,
    });

    const response = await asUser(user).request(
      `/api/column/${columns.inReview.id}`,
      { method: "DELETE" },
    );

    expect(response.status).toBe(409);
    const [still] = await db
      .select()
      .from(schema.columnTable)
      .where(eq(schema.columnTable.id, columns.inReview.id));
    expect(still).toBeDefined();
  });
});

describe("PUT /column/reorder/:projectId (auditoria 1.7)", () => {
  it("writes nothing when one of the columns belongs to another project", async () => {
    const { user, workspace } = await createWorkspaceMember({ role: "owner" });
    const { project, columns } = await createProjectFixture({
      workspaceId: workspace.id,
    });
    const other = await createProjectFixture({ workspaceId: workspace.id });

    const before = await db
      .select({
        id: schema.columnTable.id,
        position: schema.columnTable.position,
      })
      .from(schema.columnTable)
      .where(eq(schema.columnTable.projectId, project.id))
      .orderBy(asc(schema.columnTable.id));

    const response = await asUser(user).request(
      `/api/column/reorder/${project.id}`,
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          columns: [
            { id: columns.done.id, position: 0 },
            { id: other.columns.todo.id, position: 1 },
          ],
        }),
      },
    );

    expect(response.status).toBe(400);
    const after = await db
      .select({
        id: schema.columnTable.id,
        position: schema.columnTable.position,
      })
      .from(schema.columnTable)
      .where(eq(schema.columnTable.projectId, project.id))
      .orderBy(asc(schema.columnTable.id));
    expect(after).toEqual(before);
  });
});
