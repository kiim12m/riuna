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

type Hit = { title: string; status?: string; statusName?: string };

async function search(
  app: ReturnType<typeof createApp>["app"],
  workspaceId: string,
  q: string,
) {
  const response = await app.request(
    `/api/search?q=${encodeURIComponent(q)}&type=tasks&workspaceId=${workspaceId}`,
  );
  expect(response.status).toBe(200);
  const body = (await response.json()) as { results: Hit[] };
  return body.results;
}

describe("search shows the name of the column, not its slug", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  it("answers `Por hacer` for a task in the to-do column, by text and by short id", async () => {
    const member = await createWorkspaceMember({ role: "member" });
    const { project, columns } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });
    await db.insert(schema.taskTable).values({
      ...taskTreeValues(),
      projectId: project.id,
      title: "Replanteo del solar",
      status: "to-do",
      columnId: columns.todo.id,
      priority: "medium",
      number: 1,
      position: 0,
    });
    await db.insert(schema.taskTable).values({
      ...taskTreeValues(),
      projectId: project.id,
      title: "Idea para mas adelante",
      status: "planned",
      priority: "low",
      number: 2,
      position: 1,
    });
    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const [byText] = await search(app, member.workspace.id, "Replanteo");
    expect(byText?.status).toBe("to-do");
    expect(byText?.statusName).toBe(columns.todo.name);

    const [byId] = await search(app, member.workspace.id, `${project.slug}-1`);
    expect(byId?.statusName).toBe(columns.todo.name);

    // `planned` no es una columna: sin nombre, y el cliente cae al estado.
    const [planned] = await search(app, member.workspace.id, "Idea para");
    expect(planned?.status).toBe("planned");
    expect(planned?.statusName).toBeUndefined();
  });

  it("does not repeat a result when a project has two columns with the same slug", async () => {
    const member = await createWorkspaceMember({ role: "member" });
    const { project, columns } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });
    await db.insert(schema.columnTable).values({
      projectId: project.id,
      name: "Por hacer (copia)",
      slug: columns.todo.slug,
      position: 99,
    });
    await db.insert(schema.taskTable).values({
      ...taskTreeValues(),
      projectId: project.id,
      title: "Una sola vez",
      status: columns.todo.slug,
      columnId: columns.todo.id,
      priority: "medium",
      number: 1,
      position: 0,
    });
    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const hits = await search(app, member.workspace.id, "Una sola vez");

    expect(hits).toHaveLength(1);
    expect(hits[0]?.statusName).toBe(columns.todo.name);
  });
});
