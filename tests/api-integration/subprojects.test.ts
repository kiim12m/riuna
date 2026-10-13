import { eq } from "drizzle-orm";
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

async function setup() {
  const ana = await createWorkspaceMember({ userName: "Ana", role: "admin" });
  const luis = await addWorkspaceMember(ana.workspace.id, "member");
  const workspaceId = ana.workspace.id;
  const { project: henares } = await createProjectFixture({ workspaceId });
  const { project: alcala } = await createProjectFixture({ workspaceId });
  const { project: mantenimiento } = await createProjectFixture({
    workspaceId,
  });
  mockAuthenticatedSession(ana.user);
  const app = createApp().app;
  const send = (method: string, path: string, body?: unknown) =>
    app.request(path, {
      method,
      headers: { "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  const ok = async <T = Record<string, unknown>>(
    pending: Promise<Response>,
  ) => {
    const response = await pending;
    if (response.status !== 200) {
      throw new Error(`${response.status} ${await response.text()}`);
    }
    return response.json() as Promise<T>;
  };
  const setParent = (projectId: string, parentId: string | null) =>
    send("PATCH", `/api/project/${projectId}/parent`, { parentId });
  const task = (projectId: string, extra: Record<string, unknown> = {}) =>
    ok<{ id: string }>(
      send("POST", `/api/task/${projectId}`, {
        title: "Tarea",
        description: "",
        priority: "medium",
        status: "to-do",
        ...extra,
      }),
    );
  return {
    ana,
    luis,
    workspaceId,
    henares,
    alcala,
    mantenimiento,
    send,
    ok,
    setParent,
    task,
  };
}

describe("API integration: subprojects (ADR 089)", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  it("nests a project one level, aggregates the branch and keeps the history", async () => {
    const {
      workspaceId,
      henares,
      alcala,
      mantenimiento,
      send,
      ok,
      setParent,
      task,
    } = await setup();
    await ok(setParent(alcala.id, henares.id));
    await ok(setParent(mantenimiento.id, henares.id));
    // Una hecha en el padre y una por hacer en cada hijo: 1 de 3.
    await task(henares.id, { status: "done" });
    await task(alcala.id);
    await task(mantenimiento.id);

    const projects = await ok<
      Array<{
        id: string;
        parentId: string | null;
        aggregate: {
          childCount: number;
          totalTasks: number;
          completionPercentage: number;
        } | null;
      }>
    >(send("GET", `/api/project?workspaceId=${workspaceId}`));
    const parent = projects.find((project) => project.id === henares.id);
    expect(parent?.aggregate).toEqual({
      childCount: 2,
      totalTasks: 3,
      completionPercentage: 33,
    });
    expect(projects.find((p) => p.id === alcala.id)?.parentId).toBe(henares.id);

    await settleEvents();
    const activity = await ok<Array<{ type: string; eventData: unknown }>>(
      send("GET", `/api/project/${alcala.id}/activity`),
    );
    expect(activity).toEqual([
      expect.objectContaining({
        type: "parent_changed",
        eventData: { from: null, to: henares.id },
      }),
    ]);
  });

  it("refuses what would make a deeper tree or mix in personal projects", async () => {
    const { ana, workspaceId, henares, alcala, mantenimiento, ok, setParent } =
      await setup();
    await ok(setParent(alcala.id, henares.id));

    // Un hijo no puede ser padre, ni un padre hacerse hijo.
    expect((await setParent(mantenimiento.id, alcala.id)).status).toBe(400);
    expect((await setParent(henares.id, mantenimiento.id)).status).toBe(400);
    expect((await setParent(henares.id, henares.id)).status).toBe(400);

    const [personal] = await db
      .insert(schema.projectTable)
      .values({
        workspaceId,
        name: "Personal",
        slug: "personal",
        ownerUserId: ana.user.id,
      })
      .returning();
    expect((await setParent(mantenimiento.id, personal?.id ?? "")).status).toBe(
      400,
    );

    const other = await createWorkspaceMember({ userName: "Otra" });
    const { project: foreign } = await createProjectFixture({
      workspaceId: other.workspace.id,
    });
    expect((await setParent(mantenimiento.id, foreign.id)).status).toBe(400);
  });

  it("only lets those who can configure a project move it", async () => {
    const { luis, henares, alcala } = await setup();
    mockAuthenticatedSession(luis);
    const response = await createApp().app.request(
      `/api/project/${alcala.id}/parent`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ parentId: henares.id }),
      },
    );
    expect(response.status).toBe(403);
  });

  it("lets the children go when the parent is deleted", async () => {
    const { henares, alcala, send, ok, setParent } = await setup();
    await ok(setParent(alcala.id, henares.id));
    await ok(send("DELETE", `/api/project/${henares.id}`));
    const [row] = await db
      .select({ parentId: schema.projectTable.parentId })
      .from(schema.projectTable)
      .where(eq(schema.projectTable.id, alcala.id));
    expect(row?.parentId).toBeNull();
  });

  it("brings the subprojects' tasks into the parent's views on request", async () => {
    const { henares, alcala, send, ok, setParent, task } = await setup();
    await ok(setParent(alcala.id, henares.id));
    await ok(
      send("POST", `/api/field/project/${henares.id}`, {
        name: "Fase",
        type: "text",
      }),
    );
    await task(henares.id, { title: "Del padre" });
    const fromChild = await task(alcala.id, { title: "Del hijo" });
    await ok(
      send("PUT", `/api/task/estimate/${fromChild.id}`, { estimate: 3600 }),
    );

    type TasksResponse = {
      subprojectCount: number;
      subprojects: Array<{
        id: string;
        slug: string;
        tasks: Array<{ title: string }>;
      }>;
    };
    const tasksOf = async (query = "") =>
      (
        await ok<{ data: TasksResponse }>(
          send("GET", `/api/task/tasks/${henares.id}${query}`),
        )
      ).data;
    const plain = await tasksOf();
    expect(plain.subprojectCount).toBe(1);
    expect(plain.subprojects).toEqual([]);

    const withChildren = await tasksOf("?includeSubprojects=true");
    expect(withChildren.subprojects).toEqual([
      expect.objectContaining({
        id: alcala.id,
        tasks: [expect.objectContaining({ title: "Del hijo" })],
      }),
    ]);

    // Un filtro por un campo que solo tiene el padre: el hijo no aporta nada
    // y la vista no se cae.
    const filter = encodeURIComponent(
      JSON.stringify({
        type: "condition",
        field: "custom.fase",
        operator: "isEmpty",
      }),
    );
    const filtered = await tasksOf(`?includeSubprojects=true&filter=${filter}`);
    expect(filtered.subprojects[0]?.tasks).toEqual([]);

    const totals = await ok<{ count: number; estimateSeconds: number }>(
      send(
        "GET",
        `/api/task/tasks/${henares.id}/totals?includeSubprojects=true`,
      ),
    );
    expect(totals).toMatchObject({ count: 2, estimateSeconds: 3600 });
  });

  it("warns when the subprojects end after the parent", async () => {
    const { workspaceId, henares, alcala, send, ok, setParent, task } =
      await setup();
    await ok(setParent(alcala.id, henares.id));
    await ok(
      send("PATCH", `/api/project/${henares.id}/status`, {
        endDate: new Date(2026, 9, 9).toISOString(),
      }),
    );
    await task(alcala.id, { dueDate: new Date(2026, 9, 14).toISOString() });

    const projects = await ok<Array<{ id: string; schedule: unknown }>>(
      send("GET", `/api/project?workspaceId=${workspaceId}`),
    );
    expect(projects.find((p) => p.id === henares.id)?.schedule).toMatchObject({
      overflowWorkDays: 3,
    });
  });
});
