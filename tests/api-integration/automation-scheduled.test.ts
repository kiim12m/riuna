import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { checkAutomations } from "../../apps/api/src/automation/scheduled";
import db, { schema } from "../../apps/api/src/database";
import { settleEvents } from "../../apps/api/src/events";
import { createApp } from "../../apps/api/src/index";
import {
  addDays,
  startOfServerDay,
} from "../../apps/api/src/utils/day-boundaries";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import {
  addWorkspaceMember,
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";

type App = ReturnType<typeof createApp>["app"];
type User = Awaited<ReturnType<typeof addWorkspaceMember>>;

const previousKey = process.env.NOTIFICATION_SECRET_ENCRYPTION_KEY;
const SLACK = "https://hooks.slack.com/services/T000/B000/XXXXXXXX";

async function send(app: App, method: string, path: string, body?: unknown) {
  return app.request(path, {
    method,
    headers: { "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function ok(response: Response) {
  if (response.status !== 200) {
    throw new Error(`${response.status} ${await response.text()}`);
  }
  return response.json() as Promise<{ id: string }>;
}

let taskNumber = 0;

async function insertTask(
  projectId: string,
  status: string,
  dueDate: Date | null,
  extra: Partial<typeof schema.taskTable.$inferInsert> = {},
) {
  const id = `task-${randomUUID()}`;
  taskNumber += 1;
  const [task] = await db
    .insert(schema.taskTable)
    .values({
      id,
      number: taskNumber,
      path: `/${id}/`,
      depth: 0,
      projectId,
      title: "Entregar planos",
      status,
      priority: "low",
      dueDate,
      ...extra,
    })
    .returning();
  if (!task) throw new Error("Failed to seed task");
  return task;
}

const priorityOf = async (id: string) =>
  (
    await db
      .select({ priority: schema.taskTable.priority })
      .from(schema.taskTable)
      .where(eq(schema.taskTable.id, id))
  )[0]?.priority;

const runsOf = (automationId: string) =>
  db
    .select()
    .from(schema.automationRunTable)
    .where(eq(schema.automationRunTable.automationId, automationId));

describe("API integration: date-triggered automations", () => {
  beforeAll(() => {
    process.env.NOTIFICATION_SECRET_ENCRYPTION_KEY = "automation-test-key";
  });
  afterAll(() => {
    process.env.NOTIFICATION_SECRET_ENCRYPTION_KEY = previousKey;
  });
  beforeEach(async () => {
    await resetTestDatabase();
  });

  it("«due in» fires once per due date, and moving the date re-arms it", async () => {
    const admin = await createWorkspaceMember({ role: "admin" });
    const { project, columns } = await createProjectFixture({
      workspaceId: admin.workspace.id,
    });
    mockAuthenticatedSession(admin.user);
    const app = createApp().app;
    const rule = await ok(
      await send(app, "POST", `/api/automation/project/${project.id}`, {
        name: "Vence mañana",
        trigger: { type: "task.due_in", days: 1 },
        actions: [{ id: "a1", type: "priority", priority: "urgent" }],
      }),
    );
    const today = startOfServerDay(new Date());
    const tomorrow = await insertTask(project.id, "to-do", addDays(today, 1));
    const later = await insertTask(project.id, "to-do", addDays(today, 5));
    const finished = await insertTask(project.id, columns.done.slug, today, {
      completedAt: new Date(),
    });
    const undated = await insertTask(project.id, "to-do", null);

    await checkAutomations();
    await checkAutomations();
    await settleEvents();

    expect(await priorityOf(tomorrow.id)).toBe("urgent");
    expect(await priorityOf(later.id)).toBe("low");
    expect(await priorityOf(finished.id)).toBe("low");
    expect(await priorityOf(undated.id)).toBe("low");
    expect(await runsOf(rule.id)).toHaveLength(1);

    // Otra fecha, otro aviso: el disparador de la 0069 vacia el «ya hecho».
    await ok(
      await send(app, "PUT", `/api/task/due-date/${tomorrow.id}`, {
        dueDate: today.toISOString(),
      }),
    );
    await checkAutomations();
    expect(await runsOf(rule.id)).toHaveLength(2);
  });

  // El criterio de aceptacion de la fase: una regla de espacio sube la
  // prioridad de lo que vence manana en cualquier proyecto.
  it("a workspace rule raises the priority of what is due tomorrow, in every project", async () => {
    const admin = await createWorkspaceMember({ role: "admin" });
    const first = await createProjectFixture({
      workspaceId: admin.workspace.id,
    });
    const second = await createProjectFixture({
      workspaceId: admin.workspace.id,
    });
    mockAuthenticatedSession(admin.user);
    await ok(
      await send(
        createApp().app,
        "POST",
        `/api/automation/workspace/${admin.workspace.id}`,
        {
          name: "Mañana, urgente",
          trigger: { type: "task.due_in", days: 1 },
          actions: [{ id: "a1", type: "priority", priority: "urgent" }],
        },
      ),
    );
    const tomorrow = addDays(startOfServerDay(new Date()), 1);
    const here = await insertTask(first.project.id, "to-do", tomorrow);
    const there = await insertTask(second.project.id, "to-do", tomorrow);

    await checkAutomations();
    await settleEvents();

    expect(await priorityOf(here.id)).toBe("urgent");
    expect(await priorityOf(there.id)).toBe("urgent");
  });

  it("«overdue» fires from the day after, but not for what was overdue weeks ago", async () => {
    const admin = await createWorkspaceMember({ role: "admin" });
    const { project } = await createProjectFixture({
      workspaceId: admin.workspace.id,
    });
    mockAuthenticatedSession(admin.user);
    const app = createApp().app;
    await ok(
      await send(
        app,
        "POST",
        `/api/automation/workspace/${admin.workspace.id}`,
        {
          name: "Vencidas",
          trigger: { type: "task.overdue" },
          actions: [{ id: "a1", type: "priority", priority: "high" }],
        },
      ),
    );
    const today = startOfServerDay(new Date());
    const dueToday = await insertTask(project.id, "to-do", today);
    const yesterday = await insertTask(project.id, "to-do", addDays(today, -1));
    const ancient = await insertTask(project.id, "to-do", addDays(today, -30));

    await checkAutomations();
    await settleEvents();

    expect(await priorityOf(dueToday.id)).toBe("low");
    expect(await priorityOf(yesterday.id)).toBe("high");
    expect(await priorityOf(ancient.id)).toBe("low");
  });
});

describe("API integration: scheduled stand-up", () => {
  let posted: { url: string; body: string }[];
  const realFetch = globalThis.fetch;

  beforeAll(() => {
    process.env.NOTIFICATION_SECRET_ENCRYPTION_KEY = "automation-test-key";
  });
  afterAll(() => {
    process.env.NOTIFICATION_SECRET_ENCRYPTION_KEY = previousKey;
  });
  beforeEach(async () => {
    await resetTestDatabase();
    posted = [];
    // Slack y Telegram son los destinos: se interceptan sus llamadas, el resto
    // sigue igual.
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input instanceof Request ? input.url : input);
      if (
        url.startsWith("https://hooks.slack.com/") ||
        url.startsWith("https://api.telegram.org/")
      ) {
        posted.push({ url, body: String(init?.body ?? "") });
        return new Response("ok", { status: 200 });
      }
      return realFetch(input, init);
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function team(workspaceId: string, members: [User, boolean][]) {
    const teamId = `team-${randomUUID()}`;
    await db.insert(schema.teamTable).values({
      id: teamId,
      name: "Obras",
      workspaceId,
      createdAt: new Date(),
    });
    for (const [user, isLead] of members) {
      await db.insert(schema.teamMemberTable).values({
        id: randomUUID(),
        teamId,
        userId: user.id,
        isLead,
        createdAt: new Date(),
      });
    }
    return teamId;
  }

  const standupRule = (teamId: string, weekdays = [0, 1, 2, 3, 4, 5, 6]) => ({
    name: "Stand-up de Obras",
    teamId,
    trigger: { type: "schedule", weekdays, time: "00:00" },
    actions: [
      {
        id: "s1",
        type: "standup",
        channel: "slack",
        destination: { webhookUrl: SLACK },
      },
    ],
  });

  async function scenario() {
    const owner = await createWorkspaceMember({ role: "owner" });
    const named = async (name: string) => {
      const user = await addWorkspaceMember(owner.workspace.id, "member");
      await db
        .update(schema.userTable)
        .set({ name })
        .where(eq(schema.userTable.id, user.id));
      return { ...user, name };
    };
    const lead = await named("Lucía");
    const worker = await named("Marcos");
    const away = await named("Aurora");
    const teamId = await team(owner.workspace.id, [
      [lead, true],
      [worker, false],
      [away, false],
    ]);
    const other = await team(owner.workspace.id, [[worker, true]]);
    return { owner, lead, worker, away, teamId, other };
  }

  it("the lead schedules their team's stand-up, and only theirs", async () => {
    const { owner, lead, worker, teamId, other } = await scenario();
    const app = createApp().app;
    const path = `/api/automation/workspace/${owner.workspace.id}`;

    mockAuthenticatedSession(lead);
    expect((await send(app, "POST", path, standupRule(teamId))).status).toBe(
      200,
    );
    expect((await send(app, "POST", path, standupRule(other))).status).toBe(
      403,
    );
    // Ser responsable no le deja crear otras reglas de espacio.
    expect(
      (
        await send(app, "POST", path, {
          name: "Otra",
          trigger: { type: "task.created" },
          actions: [{ id: "a1", type: "priority", priority: "high" }],
        })
      ).status,
    ).toBe(403);
    expect((await send(app, "GET", `${path}/team/${teamId}`)).status).toBe(200);

    mockAuthenticatedSession(worker);
    expect((await send(app, "POST", path, standupRule(teamId))).status).toBe(
      403,
    );
  });

  it("sends once a day, without whoever is away, in Slack's bold", async () => {
    const { owner, lead, worker, away, teamId } = await scenario();
    const today = startOfServerDay(new Date());
    await db.insert(schema.userTimeOffTable).values({
      workspaceId: owner.workspace.id,
      userId: away.id,
      startsOn: today,
      endsOn: today,
    });
    mockAuthenticatedSession(owner.user);
    const rule = await ok(
      await send(
        createApp().app,
        "POST",
        `/api/automation/workspace/${owner.workspace.id}`,
        standupRule(teamId),
      ),
    );

    await checkAutomations();
    await checkAutomations();

    expect(posted).toHaveLength(1);
    const { text } = JSON.parse(posted[0]?.body ?? "{}") as { text: string };
    expect(text).toContain("*Stand-up de Obras*");
    expect(text).toContain(`*${lead.name}*`);
    expect(text).toContain(`*${worker.name}*`);
    expect(text).not.toContain("**");
    expect(text).not.toContain(away.name);
    const runs = await runsOf(rule.id);
    expect(runs.map((run) => [run.status, run.detail])).toEqual([
      ["ok", expect.objectContaining({ people: 3 - 1 })],
    ]);
  });

  // El criterio de aceptacion de la fase: el stand-up llega a Telegram.
  it("goes out to Telegram as plain text, to its chat and thread", async () => {
    const { owner, lead, teamId } = await scenario();
    mockAuthenticatedSession(owner.user);
    await ok(
      await send(
        createApp().app,
        "POST",
        `/api/automation/workspace/${owner.workspace.id}`,
        {
          ...standupRule(teamId),
          actions: [
            {
              id: "t1",
              type: "standup",
              channel: "telegram",
              destination: {
                botToken: "12345678:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
                chatId: "-100200300",
                threadId: 7,
              },
            },
          ],
        },
      ),
    );

    await checkAutomations();

    expect(posted).toHaveLength(1);
    expect(posted[0]?.url).toBe(
      "https://api.telegram.org/bot12345678:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/sendMessage",
    );
    const message = JSON.parse(posted[0]?.body ?? "{}") as {
      chat_id: string;
      message_thread_id: number;
      text: string;
    };
    expect([message.chat_id, message.message_thread_id]).toEqual([
      "-100200300",
      7,
    ]);
    expect(message.text).toContain("Stand-up de Obras");
    expect(message.text).toContain(lead.name);
    expect(message.text).not.toContain("*");
  });

  it("does not go out on a holiday, nor on a day it is not scheduled for", async () => {
    const { owner, teamId } = await scenario();
    mockAuthenticatedSession(owner.user);
    const app = createApp().app;
    const path = `/api/automation/workspace/${owner.workspace.id}`;
    const today = startOfServerDay(new Date());
    const weekday = new Date(
      `${new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date())}T12:00:00Z`,
    ).getUTCDay();

    const notToday = await ok(
      await send(app, "POST", path, {
        ...standupRule(teamId, [(weekday + 1) % 7]),
        name: "Mañana no",
      }),
    );
    await db.insert(schema.workspaceHolidayTable).values({
      workspaceId: owner.workspace.id,
      day: today,
      name: "Fiesta",
    });
    const holiday = await ok(
      await send(app, "POST", path, standupRule(teamId)),
    );

    await checkAutomations();

    expect(posted).toEqual([]);
    expect(await runsOf(notToday.id)).toEqual([]);
    expect((await runsOf(holiday.id)).map((run) => run.detail)).toEqual([
      { reason: "holiday" },
    ]);
  });

  it("a stand-up only goes out on a schedule, and only a schedule names a team", async () => {
    const { owner, teamId } = await scenario();
    mockAuthenticatedSession(owner.user);
    const app = createApp().app;
    const path = `/api/automation/workspace/${owner.workspace.id}`;
    const rule = standupRule(teamId);

    expect(
      (
        await send(app, "POST", path, {
          ...rule,
          trigger: { type: "task.created" },
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await send(app, "POST", path, {
          ...rule,
          actions: [{ id: "a1", type: "priority", priority: "high" }],
        })
      ).status,
    ).toBe(400);
  });
});
