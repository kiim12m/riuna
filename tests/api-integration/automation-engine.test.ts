import { createHmac } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import db, { schema } from "../../apps/api/src/database";
import { settleEvents } from "../../apps/api/src/events";
import { createApp } from "../../apps/api/src/index";
import { proposeMapping } from "../../apps/api/src/task/exchange/map-rows";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import {
  addWorkspaceMember,
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";

type App = ReturnType<typeof createApp>["app"];

const previousKey = process.env.NOTIFICATION_SECRET_ENCRYPTION_KEY;
const previousPrivate = process.env.RIUNA_ALLOW_PRIVATE_WEBHOOK_DESTINATIONS;

async function send(app: App, method: string, path: string, body?: unknown) {
  const response = await app.request(path, {
    method,
    headers: { "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (response.status !== 200) {
    throw new Error(
      `${method} ${path} -> ${response.status} ${await response.text()}`,
    );
  }
  return response.json() as Promise<{ id: string } & Record<string, unknown>>;
}

async function setup() {
  const admin = await createWorkspaceMember({ role: "admin" });
  const fixture = await createProjectFixture({
    workspaceId: admin.workspace.id,
  });
  mockAuthenticatedSession(admin.user);
  return { admin, ...fixture, app: createApp().app };
}

function createTask(
  app: App,
  projectId: string,
  extra: Record<string, unknown> = {},
) {
  return send(app, "POST", `/api/task/${projectId}`, {
    title: "Revisar presupuesto",
    description: "",
    priority: "low",
    status: "to-do",
    ...extra,
  });
}

async function taskRow(id: string) {
  const [row] = await db
    .select()
    .from(schema.taskTable)
    .where(eq(schema.taskTable.id, id));
  return row;
}

function runsOf(automationId: string) {
  return db
    .select()
    .from(schema.automationRunTable)
    .where(eq(schema.automationRunTable.automationId, automationId))
    .orderBy(schema.automationRunTable.startedAt);
}

/** Un receptor de webhooks de verdad, en un puerto libre. */
async function startReceiver() {
  const received: { body: string; signature: string | undefined }[] = [];
  const server = createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      received.push({
        body,
        signature: request.headers["x-riuna-signature"] as string | undefined,
      });
      response.writeHead(200).end("ok");
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}/hook`,
    received,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

const priorityTo = (to: string) => ({ type: "task.priority_changed", to });
const setPriority = (id: string, priority: string) => ({
  id,
  type: "priority",
  priority,
});

describe("API integration: automation engine", () => {
  beforeAll(() => {
    process.env.NOTIFICATION_SECRET_ENCRYPTION_KEY = "automation-test-key";
  });

  afterAll(() => {
    process.env.NOTIFICATION_SECRET_ENCRYPTION_KEY = previousKey;
    process.env.RIUNA_ALLOW_PRIVATE_WEBHOOK_DESTINATIONS = previousPrivate;
  });

  beforeEach(async () => {
    process.env.RIUNA_ALLOW_PRIVATE_WEBHOOK_DESTINATIONS = "true";
    await resetTestDatabase();
  });

  // El criterio de aceptacion de la Fase 8: una regla mueve la tarea, avisa y
  // dispara un webhook sin intervencion.
  it("a project rule moves the task, notifies and fires a signed webhook", async () => {
    const { admin, project, columns, app } = await setup();
    const assignee = await addWorkspaceMember(admin.workspace.id, "member");
    const receiver = await startReceiver();

    try {
      const rule = await send(
        app,
        "POST",
        `/api/automation/project/${project.id}`,
        {
          name: "Urgente a curso",
          trigger: priorityTo("urgent"),
          actions: [
            { id: "a1", type: "move", columnId: columns.inProgress.id },
            {
              id: "a2",
              type: "notify",
              recipients: { assignees: true },
              message: "{titulo} pasa a {estado}",
            },
            { id: "a3", type: "webhook", url: receiver.url, secret: "s3cret" },
          ],
        },
      );
      const task = await createTask(app, project.id, { userId: assignee.id });

      await send(app, "PUT", `/api/task/priority/${task.id}`, {
        priority: "urgent",
      });
      await settleEvents();

      expect((await taskRow(task.id))?.status).toBe(columns.inProgress.slug);

      const notifications = await db
        .select()
        .from(schema.notificationTable)
        .where(
          and(
            eq(schema.notificationTable.userId, assignee.id),
            eq(schema.notificationTable.type, "automation"),
          ),
        );
      expect(notifications.map((n) => [n.title, n.content])).toEqual([
        [
          "Urgente a curso",
          `Revisar presupuesto pasa a ${columns.inProgress.name}`,
        ],
      ]);

      expect(receiver.received).toHaveLength(1);
      const [delivery] = receiver.received;
      const payload = JSON.parse(delivery?.body ?? "{}");
      expect(payload).toMatchObject({
        event: "automation.fired",
        automation: { id: rule.id, name: "Urgente a curso" },
        trigger: "task.priority_changed",
        task: { id: task.id, status: columns.inProgress.slug },
      });
      expect(delivery?.signature).toBe(
        createHmac("sha256", "s3cret")
          .update(delivery?.body ?? "")
          .digest("hex"),
      );

      const runs = await runsOf(rule.id);
      expect(runs.map((run) => run.status)).toEqual(["ok"]);

      // La actividad nombra a la regla como autora del movimiento.
      const [moved] = await db
        .select()
        .from(schema.activityTable)
        .where(
          and(
            eq(schema.activityTable.taskId, task.id),
            eq(schema.activityTable.type, "status_changed"),
          ),
        );
      expect(moved?.eventData).toMatchObject({
        automation: { id: rule.id, name: "Urgente a curso" },
      });
    } finally {
      await receiver.close();
    }
  });

  it("only acts on the tasks that meet its conditions, custom fields included", async () => {
    const { project, app } = await setup();
    await send(app, "POST", `/api/field/project/${project.id}`, {
      name: "Presupuesto",
      type: "number",
    });
    await send(app, "POST", `/api/automation/project/${project.id}`, {
      name: "Caras primero",
      trigger: { type: "task.field_changed", fieldKey: "presupuesto" },
      conditions: [
        { id: "c1", field: "custom.presupuesto", operator: "gt", value: 1000 },
      ],
      actions: [setPriority("a1", "high")],
    });
    const cara = await createTask(app, project.id);
    const barata = await createTask(app, project.id);

    await send(app, "PUT", `/api/task/custom-fields/${cara.id}`, {
      values: { presupuesto: 2500 },
    });
    await send(app, "PUT", `/api/task/custom-fields/${barata.id}`, {
      values: { presupuesto: 500 },
    });
    await settleEvents();

    expect((await taskRow(cara.id))?.priority).toBe("high");
    expect((await taskRow(barata.id))?.priority).toBe("low");
  });

  it("a workspace rule acts in every project but the personal ones", async () => {
    const { admin, project, app } = await setup();
    const other = await createProjectFixture({
      workspaceId: admin.workspace.id,
    });
    const personal = await createProjectFixture({
      workspaceId: admin.workspace.id,
    });
    await db
      .update(schema.projectTable)
      .set({ ownerUserId: admin.user.id })
      .where(eq(schema.projectTable.id, personal.project.id));

    await send(app, "POST", `/api/automation/workspace/${admin.workspace.id}`, {
      name: "Todo urgente",
      trigger: { type: "task.created" },
      actions: [setPriority("a1", "urgent")],
    });
    const here = await createTask(app, project.id);
    const there = await createTask(app, other.project.id);
    const mine = await createTask(app, personal.project.id);
    await settleEvents();

    expect((await taskRow(here.id))?.priority).toBe("urgent");
    expect((await taskRow(there.id))?.priority).toBe("urgent");
    expect((await taskRow(mine.id))?.priority).toBe("low");
  });

  it("cuts a loop between two rules and says so", async () => {
    const { project, app } = await setup();
    const a = await send(app, "POST", `/api/automation/project/${project.id}`, {
      name: "A",
      trigger: priorityTo("high"),
      actions: [setPriority("a1", "low")],
    });
    const b = await send(app, "POST", `/api/automation/project/${project.id}`, {
      name: "B",
      trigger: priorityTo("low"),
      actions: [setPriority("b1", "high")],
    });
    const task = await createTask(app, project.id, { priority: "medium" });

    await send(app, "PUT", `/api/task/priority/${task.id}`, {
      priority: "high",
    });
    await settleEvents();

    expect((await runsOf(a.id)).map((run) => run.status)).toEqual([
      "ok",
      "skipped",
    ]);
    expect((await runsOf(b.id)).map((run) => run.status)).toEqual(["ok"]);
    const [skipped] = (await runsOf(a.id)).slice(-1);
    expect(skipped?.detail).toMatchObject({ reason: "loop" });
  });

  it("an import does not fire automations", async () => {
    const { project, app } = await setup();
    const rule = await send(
      app,
      "POST",
      `/api/automation/project/${project.id}`,
      {
        name: "Todo urgente",
        trigger: { type: "task.created" },
        actions: [setPriority("a1", "urgent")],
      },
    );
    const headers = ["Título", "Prioridad"];
    const form = new FormData();
    form.append(
      "file",
      new File(
        [`${headers.join(",")}\r\nUna,Baja\r\nOtra,Baja\r\n`],
        "tareas.csv",
        { type: "text/csv" },
      ),
    );
    form.append("mapping", JSON.stringify(proposeMapping(headers)));

    const imported = await app.request(`/api/task/import/${project.id}`, {
      method: "POST",
      body: form,
    });
    expect(imported.status).toBe(200);
    await settleEvents();

    expect(await runsOf(rule.id)).toEqual([]);
  });

  it("does not fire for what a cascade carries along", async () => {
    const { project, columns, app } = await setup();
    await db
      .update(schema.projectTable)
      .set({ cascadeClose: true })
      .where(eq(schema.projectTable.id, project.id));
    const rule = await send(
      app,
      "POST",
      `/api/automation/project/${project.id}`,
      {
        name: "Al cerrar",
        trigger: { type: "task.status_changed", toFinal: true },
        actions: [setPriority("a1", "urgent")],
      },
    );
    const parent = await createTask(app, project.id);
    const child = await createTask(app, project.id, { parentId: parent.id });

    await send(app, "PUT", `/api/task/status/${parent.id}`, {
      status: columns.done.slug,
    });
    await settleEvents();

    expect((await taskRow(child.id))?.status).toBe(columns.done.slug);
    expect((await taskRow(child.id))?.priority).toBe("low");
    expect((await runsOf(rule.id)).map((run) => run.taskId)).toEqual([
      parent.id,
    ]);
  });

  it("pauses a rule whose author lost the permission it needs", async () => {
    const { admin, project, app } = await setup();
    const rule = await send(
      app,
      "POST",
      `/api/automation/project/${project.id}`,
      {
        name: "Todo urgente",
        trigger: { type: "task.created" },
        actions: [setPriority("a1", "urgent")],
      },
    );
    await db
      .update(schema.workspaceUserTable)
      .set({ role: "member" })
      .where(eq(schema.workspaceUserTable.userId, admin.user.id));

    const task = await createTask(app, project.id);
    await settleEvents();

    expect((await taskRow(task.id))?.priority).toBe("low");
    const [row] = await db
      .select()
      .from(schema.automationTable)
      .where(eq(schema.automationTable.id, rule.id));
    expect([row?.enabled, row?.pausedReason]).toEqual([
      false,
      "actor_lost_permission",
    ]);
    expect((await runsOf(rule.id)).map((run) => run.status)).toEqual([
      "skipped",
    ]);
  });

  it("a webhook to a private address fails, and stops the actions after it", async () => {
    const { project, app } = await setup();
    const rule = await send(
      app,
      "POST",
      `/api/automation/project/${project.id}`,
      {
        name: "Fuera y luego urgente",
        trigger: { type: "task.created" },
        actions: [
          { id: "a1", type: "webhook", url: "http://127.0.0.1:9/hook" },
          setPriority("a2", "urgent"),
        ],
      },
    );
    process.env.RIUNA_ALLOW_PRIVATE_WEBHOOK_DESTINATIONS = "false";

    const task = await createTask(app, project.id);
    await settleEvents();

    const [run] = await runsOf(rule.id);
    expect(run?.status).toBe("failed");
    expect(JSON.stringify(run?.detail)).toContain("non-routable");
    expect((await taskRow(task.id))?.priority).toBe("low");
  });
});
