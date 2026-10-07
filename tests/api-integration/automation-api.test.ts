import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { createApiKey, mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import {
  addWorkspaceMember,
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";

type App = ReturnType<typeof createApp>["app"];

const previousKey = process.env.NOTIFICATION_SECRET_ENCRYPTION_KEY;
const previousPrivate = process.env.RIUNA_ALLOW_PRIVATE_WEBHOOK_DESTINATIONS;

async function setup(role = "admin") {
  const member = await createWorkspaceMember({ role });
  const fixture = await createProjectFixture({
    workspaceId: member.workspace.id,
  });
  mockAuthenticatedSession(member.user);
  return { member, ...fixture, app: createApp().app };
}

function send(app: App, method: string, path: string, body?: unknown) {
  return app.request(path, {
    method,
    headers: { "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

const notifyOnDone = (toColumnId: string) => ({
  name: "Avisar al cerrar",
  trigger: { type: "task.status_changed", toColumnId },
  actions: [
    {
      id: "a1",
      type: "notify",
      recipients: { assignees: true },
      message: "{tarea} está hecha",
    },
  ],
});

describe("API integration: automations", () => {
  beforeAll(() => {
    process.env.NOTIFICATION_SECRET_ENCRYPTION_KEY = "automation-test-key";
    // Sin resolver DNS: la guarda anti-SSRF tiene sus propias pruebas.
    process.env.RIUNA_ALLOW_PRIVATE_WEBHOOK_DESTINATIONS = "true";
  });

  afterAll(() => {
    process.env.NOTIFICATION_SECRET_ENCRYPTION_KEY = previousKey;
    process.env.RIUNA_ALLOW_PRIVATE_WEBHOOK_DESTINATIONS = previousPrivate;
  });

  beforeEach(async () => {
    await resetTestDatabase();
  });

  it("an admin creates a project rule and lists it with no run yet", async () => {
    const { project, columns, app } = await setup();

    const created = await send(
      app,
      "POST",
      `/api/automation/project/${project.id}`,
      notifyOnDone(columns.done.id),
    );
    expect(created.status).toBe(200);
    const rule = (await created.json()) as {
      id: string;
      trigger: { type: string; toColumnId: string };
      enabled: boolean;
    };
    expect(rule.trigger).toEqual({
      type: "task.status_changed",
      toColumnId: columns.done.id,
    });
    expect(rule.enabled).toBe(true);

    const listed = await send(
      app,
      "GET",
      `/api/automation/project/${project.id}`,
    );
    const rules = (await listed.json()) as Array<{
      id: string;
      lastRun: unknown;
    }>;
    expect(rules.map((r) => [r.id, r.lastRun])).toEqual([[rule.id, null]]);
  });

  it("a member can neither list nor create rules", async () => {
    const { project, columns, app } = await setup("member");

    expect(
      (await send(app, "GET", `/api/automation/project/${project.id}`)).status,
    ).toBe(403);
    expect(
      (
        await send(
          app,
          "POST",
          `/api/automation/project/${project.id}`,
          notifyOnDone(columns.done.id),
        )
      ).status,
    ).toBe(403);
  });

  it("an API key without project:update cannot create a rule", async () => {
    const { member, project, columns } = await setup();
    const key = await createApiKey(member.user.id, { project: ["read"] });
    const { app } = createApp();

    const response = await app.request(
      `/api/automation/project/${project.id}`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": key },
        body: JSON.stringify(notifyOnDone(columns.done.id)),
      },
    );

    expect(response.status).toBe(403);
  });

  it("rejects what does not belong to the rule's project", async () => {
    const { member, project, app } = await setup();
    const other = await createProjectFixture({
      workspaceId: member.workspace.id,
    });

    const foreignColumn = await send(
      app,
      "POST",
      `/api/automation/project/${project.id}`,
      notifyOnDone(other.columns.done.id),
    );
    expect(foreignColumn.status).toBe(400);

    const unknownField = await send(
      app,
      "POST",
      `/api/automation/project/${project.id}`,
      {
        ...notifyOnDone(project.id),
        trigger: { type: "task.created" },
        conditions: [
          { id: "c1", field: "custom.nada", operator: "eq", value: "x" },
        ],
      },
    );
    expect(unknownField.status).toBe(400);
  });

  it("a workspace rule cannot name a column, and needs manage_settings", async () => {
    const { member, columns, app } = await setup();
    const path = `/api/automation/workspace/${member.workspace.id}`;

    expect(
      (await send(app, "POST", path, notifyOnDone(columns.done.id))).status,
    ).toBe(400);

    const created = await send(app, "POST", path, {
      ...notifyOnDone(columns.done.id),
      trigger: { type: "task.status_changed", toFinal: true },
    });
    expect(created.status).toBe(200);

    mockAuthenticatedSession(
      await addWorkspaceMember(member.workspace.id, "member"),
    );
    expect((await send(app, "GET", path)).status).toBe(403);
  });

  it("stores a webhook secret encrypted, never returns it, and keeps it on edit", async () => {
    const { project, app } = await setup();
    const rule = (url: string, secret?: string) => ({
      name: "Avisar fuera",
      trigger: { type: "task.created" },
      actions: [
        {
          id: "w1",
          type: "webhook",
          url,
          ...(secret === undefined ? {} : { secret }),
        },
      ],
    });

    const created = await send(
      app,
      "POST",
      `/api/automation/project/${project.id}`,
      rule("http://127.0.0.1:9/hook", "muy-secreto"),
    );
    expect(created.status).toBe(200);
    const body = await created.text();
    expect(body).not.toContain("muy-secreto");
    const { id, actions } = JSON.parse(body) as {
      id: string;
      actions: Array<{ hasSecret: boolean }>;
    };
    expect(actions[0]?.hasSecret).toBe(true);

    const stored = async () => {
      const [row] = await db
        .select({ actions: schema.automationTable.actions })
        .from(schema.automationTable)
        .where(eq(schema.automationTable.id, id));
      const actions = (row?.actions ?? []) as Array<{ secret?: string }>;
      return actions[0]?.secret;
    };
    const sealed = await stored();
    expect(sealed?.startsWith("enc:v1:")).toBe(true);

    // Sin secreto, se conserva el guardado.
    await send(
      app,
      "PUT",
      `/api/automation/${id}`,
      rule("http://127.0.0.1:9/otro"),
    );
    expect(await stored()).toBe(sealed);

    // Vacio, se quita.
    await send(
      app,
      "PUT",
      `/api/automation/${id}`,
      rule("http://127.0.0.1:9/otro", ""),
    );
    expect(await stored()).toBeUndefined();
  });

  it("archives a rule: it leaves the list and can no longer be edited", async () => {
    const { project, columns, app } = await setup();
    const created = await send(
      app,
      "POST",
      `/api/automation/project/${project.id}`,
      notifyOnDone(columns.done.id),
    );
    const { id } = (await created.json()) as { id: string };

    expect((await send(app, "DELETE", `/api/automation/${id}`)).status).toBe(
      200,
    );

    const listed = await send(
      app,
      "GET",
      `/api/automation/project/${project.id}`,
    );
    expect(await listed.json()).toEqual([]);
    expect(
      (
        await send(
          app,
          "PUT",
          `/api/automation/${id}`,
          notifyOnDone(columns.done.id),
        )
      ).status,
    ).toBe(404);
  });

  it("a rule cannot be reached from another workspace", async () => {
    const { project, columns, app } = await setup();
    const created = await send(
      app,
      "POST",
      `/api/automation/project/${project.id}`,
      notifyOnDone(columns.done.id),
    );
    const { id } = (await created.json()) as { id: string };

    const stranger = await createWorkspaceMember({ role: "owner" });
    mockAuthenticatedSession(stranger.user);

    expect(
      (
        await send(app, "PATCH", `/api/automation/${id}/enabled`, {
          enabled: false,
        })
      ).status,
    ).toBe(403);
  });
});
