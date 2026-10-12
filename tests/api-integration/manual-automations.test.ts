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

type User = typeof schema.userTable.$inferSelect;

function as(user: User) {
  mockAuthenticatedSession(user);
  return createApp().app;
}

async function send(user: User, method: string, path: string, body?: unknown) {
  return as(user).request(path, {
    method,
    headers: { "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function ok<T = Record<string, unknown>>(response: Response) {
  if (response.status !== 200) {
    throw new Error(`${response.status} ${await response.text()}`);
  }
  return response.json() as Promise<T>;
}

async function taskRow(id: string) {
  const [row] = await db
    .select()
    .from(schema.taskTable)
    .where(eq(schema.taskTable.id, id));
  return row;
}

async function setup() {
  const ana = await createWorkspaceMember({ userName: "Ana", role: "admin" });
  const ws = ana.workspace.id;
  const luis = await addWorkspaceMember(ws, "member");
  const vera = await addWorkspaceMember(ws, "viewer");
  const { project, columns } = await createProjectFixture({ workspaceId: ws });

  // «Enviar a revisión»: solo para lo urgente o alto, mueve a En revisión.
  const rule = await ok<{ id: string }>(
    await send(ana.user, "POST", `/api/automation/project/${project.id}`, {
      name: "Enviar a revisión",
      trigger: { type: "manual" },
      conditions: [
        {
          id: "c1",
          field: "priority",
          operator: "in",
          value: ["high", "urgent"],
        },
      ],
      actions: [{ id: "a1", type: "move", columnId: columns.inReview.id }],
    }),
  );

  const createTask = async (priority: string) =>
    ok<{ id: string }>(
      await send(ana.user, "POST", `/api/task/${project.id}`, {
        title: "Instalación eléctrica",
        description: "",
        priority,
        status: "to-do",
      }),
    );

  return { ana: ana.user, luis, vera, project, columns, rule, createTask };
}

describe("API integration: one-click actions (ADR 078)", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  it("offers the action only while the task meets its conditions", async () => {
    const { luis, rule, createTask } = await setup();
    const high = await createTask("high");
    const low = await createTask("low");

    const offered = await ok(
      await send(luis, "GET", `/api/automation/manual/task/${high.id}`),
    );
    expect(offered).toEqual([{ id: rule.id, name: "Enviar a revisión" }]);

    expect(
      await ok(
        await send(luis, "GET", `/api/automation/manual/task/${low.id}`),
      ),
    ).toEqual([]);
  });

  it("runs on behalf of whoever presses, and the history says so", async () => {
    const { luis, columns, rule, createTask } = await setup();
    const row = await createTask("urgent");

    const result = await ok<{ status: string }>(
      await send(luis, "POST", `/api/automation/manual/task/${row.id}`, {
        automationId: rule.id,
      }),
    );
    expect(result.status).toBe("ok");
    await settleEvents();

    expect((await taskRow(row.id))?.status).toBe(columns.inReview.slug);

    const activity = await db
      .select()
      .from(schema.activityTable)
      .where(eq(schema.activityTable.taskId, row.id));
    const moved = activity.find((entry) => {
      const data = entry.eventData as { automation?: unknown } | null;
      return Boolean(data?.automation);
    });
    expect(moved?.userId).toBe(luis.id);
    expect(moved?.eventData).toMatchObject({
      automation: {
        id: rule.id,
        name: "Enviar a revisión",
        pressedBy: luis.id,
      },
    });

    const [run] = await db
      .select()
      .from(schema.automationRunTable)
      .where(eq(schema.automationRunTable.automationId, rule.id));
    expect(run?.status).toBe("ok");
    expect(run?.detail).toMatchObject({ event: "manual", pressedBy: luis.id });
  });

  it("refuses a task that no longer meets the conditions", async () => {
    const { luis, rule, createTask } = await setup();
    const row = await createTask("low");

    const response = await send(
      luis,
      "POST",
      `/api/automation/manual/task/${row.id}`,
      { automationId: rule.id },
    );
    expect(response.status).toBe(409);
  });

  it("shows nothing to a viewer and does not let them press", async () => {
    const { vera, rule, createTask } = await setup();
    const row = await createTask("high");

    expect(
      await ok(
        await send(vera, "GET", `/api/automation/manual/task/${row.id}`),
      ),
    ).toEqual([]);
    const response = await send(
      vera,
      "POST",
      `/api/automation/manual/task/${row.id}`,
      { automationId: rule.id },
    );
    expect(response.status).toBe(403);
  });

  it("does not offer a paused rule, nor fire on events", async () => {
    const { ana, luis, rule, createTask } = await setup();
    const row = await createTask("high");
    await ok(
      await send(ana, "PATCH", `/api/automation/${rule.id}/enabled`, {
        enabled: false,
      }),
    );

    expect(
      await ok(
        await send(luis, "GET", `/api/automation/manual/task/${row.id}`),
      ),
    ).toEqual([]);
    const response = await send(
      luis,
      "POST",
      `/api/automation/manual/task/${row.id}`,
      { automationId: rule.id },
    );
    expect(response.status).toBe(404);

    // Crear la tarea no la disparo: el disparador manual no escucha el bus.
    const runs = await db
      .select()
      .from(schema.automationRunTable)
      .where(eq(schema.automationRunTable.automationId, rule.id));
    expect(runs).toEqual([]);
  });
});
