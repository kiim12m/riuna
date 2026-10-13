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

type Baseline = {
  at: string;
  added: string[];
  removed: Array<{ id: string; title: string; priority: string }>;
  changed: Array<{ id: string; before: Record<string, unknown> }>;
};

const day = (date: number) => new Date(2026, 9, date).toISOString();
const pause = () => new Promise((resolve) => setTimeout(resolve, 30));

async function setup() {
  const ana = await createWorkspaceMember({ userName: "Ana", role: "admin" });
  const luis = await addWorkspaceMember(ana.workspace.id, "member");
  const { project, columns } = await createProjectFixture({
    workspaceId: ana.workspace.id,
  });
  await db.insert(schema.fieldDefinitionTable).values({
    workspaceId: ana.workspace.id,
    projectId: project.id,
    key: "presupuesto",
    name: "Presupuesto",
    type: "number",
  });
  mockAuthenticatedSession(ana.user);
  const app = createApp().app;

  const send = (method: string, path: string, body?: unknown) =>
    app.request(path, {
      method,
      headers: { "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  const ok = async <T = { id: string }>(pending: Promise<Response>) => {
    const response = await pending;
    if (response.status !== 200) {
      throw new Error(`${response.status} ${await response.text()}`);
    }
    return response.json() as Promise<T>;
  };
  const create = (extra: Record<string, unknown> = {}) =>
    ok(
      send("POST", `/api/task/${project.id}`, {
        title: "Tarea",
        description: "",
        priority: "medium",
        status: "to-do",
        ...extra,
      }),
    );
  const baseline = async (at: string, filter?: unknown) => {
    await settleEvents();
    const query = new URLSearchParams({ at });
    if (filter) query.set("filter", JSON.stringify(filter));
    return ok<Baseline>(
      send("GET", `/api/task/tasks/${project.id}/baseline?${query}`),
    );
  };

  return { ana, luis, project, columns, send, ok, create, baseline };
}

describe("API integration: baseline (ADR 085)", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  it("shows what changed since then, with the previous values", async () => {
    const { columns, send, ok, create, baseline } = await setup();
    const task = await create({ title: "Acometida", dueDate: day(14) });
    const quiet = await create({ title: "Sin cambios" });
    await settleEvents();
    await pause();
    const then = new Date().toISOString();
    await pause();

    await ok(
      send("PUT", `/api/task/due-date/${task.id}`, { dueDate: day(20) }),
    );
    await ok(
      send("PUT", `/api/task/title/${task.id}`, { title: "Acometida nueva" }),
    );
    await ok(
      send("PUT", `/api/task/status/${task.id}`, {
        status: columns.inProgress.slug,
      }),
    );
    // Dos cambios del mismo campo: vale el valor de antes del primero.
    await ok(
      send("PUT", `/api/task/due-date/${task.id}`, { dueDate: day(27) }),
    );

    const result = await baseline(then);
    expect(result.added).toEqual([]);
    expect(result.removed).toEqual([]);
    expect(result.changed).toEqual([
      {
        id: task.id,
        before: {
          title: "Acometida",
          status: "to-do",
          dueDate: new Date(day(14)).toISOString(),
        },
      },
    ]);
    expect(result.changed.map((entry) => entry.id)).not.toContain(quiet.id);
  });

  it("says what entered and left the filter, new tasks included", async () => {
    const { send, ok, create, baseline } = await setup();
    const leaves = await create({ title: "Sale", priority: "high" });
    const enters = await create({ title: "Entra", priority: "low" });
    await settleEvents();
    await pause();
    const then = new Date().toISOString();
    await pause();

    await ok(
      send("PUT", `/api/task/priority/${leaves.id}`, { priority: "low" }),
    );
    await ok(
      send("PUT", `/api/task/priority/${enters.id}`, { priority: "high" }),
    );
    const fresh = await create({ title: "Nueva", priority: "high" });

    const result = await baseline(then, {
      type: "condition",
      field: "priority",
      operator: "eq",
      value: "high",
    });
    expect(result.added.sort()).toEqual([enters.id, fresh.id].sort());
    // Lo que salio llega con sus valores de entonces, para pintarlo.
    expect(result.removed).toEqual([
      expect.objectContaining({
        id: leaves.id,
        title: "Sale",
        priority: "high",
      }),
    ]);
  });

  it("filters the past on custom fields too", async () => {
    const { send, ok, create, baseline } = await setup();
    const cara = await create({ title: "Cara" });
    await ok(
      send("PUT", `/api/task/custom-fields/${cara.id}`, {
        values: { presupuesto: 5000 },
      }),
    );
    await settleEvents();
    await pause();
    const then = new Date().toISOString();
    await pause();
    await ok(
      send("PUT", `/api/task/custom-fields/${cara.id}`, {
        values: { presupuesto: 100 },
      }),
    );

    const result = await baseline(then, {
      type: "condition",
      field: "custom.presupuesto",
      operator: "gt",
      value: 1000,
    });
    expect(result.removed.map((entry) => entry.id)).toEqual([cara.id]);
  });

  it("trusts the present when old activity did not keep the previous value", async () => {
    const { ana, luis, create, baseline } = await setup();
    const task = await create({ title: "Antigua" });
    await settleEvents();
    await pause();
    const then = new Date().toISOString();
    await pause();
    // Una fila como las de antes de la ADR 085: sin `oldAssigneeId`.
    await db.insert(schema.activityTable).values({
      taskId: task.id,
      type: "assignee_changed",
      userId: ana.user.id,
      content: null,
      eventData: { newAssigneeId: luis.id, newAssignee: "Luis" },
    });

    const result = await baseline(then);
    expect(result.changed).toEqual([]);
  });

  it("refuses a moment in the future", async () => {
    const { project, send } = await setup();
    const response = await send(
      "GET",
      `/api/task/tasks/${project.id}/baseline?at=${encodeURIComponent(
        new Date(Date.now() + 86_400_000).toISOString(),
      )}`,
    );
    expect(response.status).toBe(400);
  });
});
