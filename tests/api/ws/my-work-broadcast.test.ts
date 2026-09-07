import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Handler = (data: Record<string, unknown>) => Promise<void>;

// `vi.mock` se iza por encima de todo lo demas del modulo, asi que lo que sus
// fabricas usen tiene que declararse con `vi.hoisted` o no existe todavia
// cuando `ws/index.ts` registra sus suscriptores al importarse.
const { handlers, mockWhere } = vi.hoisted(() => ({
  handlers: new Map<string, Handler[]>(),
  mockWhere: vi.fn(),
}));

vi.mock("../../../apps/api/src/events", () => ({
  subscribeToEvent: (eventName: string, handler: Handler) => {
    const list = handlers.get(eventName) ?? [];
    list.push(handler);
    handlers.set(eventName, list);
  },
  publishEvent: vi.fn(),
}));

vi.mock("../../../apps/api/src/database", () => ({
  default: {
    selectDistinct: () => ({
      from: () => ({ where: (...args: unknown[]) => mockWhere(...args) }),
    }),
  },
  schema: {},
}));

import { MY_WORK_EVENTS } from "../../../apps/api/src/my-work/recipients";
import {
  addUserConnection,
  initializeWebSocketAdapter,
  removeUserConnection,
  shutdownWebSocketAdapter,
} from "../../../apps/api/src/ws/index";

function makeFakeWs() {
  return {
    send: vi.fn(),
    close: vi.fn(),
    readyState: 1,
    raw: undefined,
    url: null,
    protocol: null,
  } as never;
}

function sendMock(ws: unknown) {
  return (ws as { send: ReturnType<typeof vi.fn> }).send;
}

async function fire(eventName: string, data: Record<string, unknown>) {
  for (const handler of handlers.get(eventName) ?? []) {
    await handler(data);
  }
}

describe("my work realtime wiring", () => {
  const originalRedisUrl = process.env.REDIS_URL;

  beforeEach(async () => {
    delete process.env.REDIS_URL;
    mockWhere.mockReset();
    mockWhere.mockResolvedValue([]);
    await initializeWebSocketAdapter();
  });

  afterEach(async () => {
    await shutdownWebSocketAdapter();
    if (originalRedisUrl === undefined) {
      delete process.env.REDIS_URL;
    } else {
      process.env.REDIS_URL = originalRedisUrl;
    }
  });

  it("subscribes to every membership event and to nothing else", () => {
    for (const eventName of MY_WORK_EVENTS) {
      expect(handlers.has(eventName)).toBe(true);
    }

    // El contenido no se empuja: `task.updated` si tiene suscriptor —el de la
    // difusion por proyecto— pero no esta en la lista de "Mi trabajo".
    expect(MY_WORK_EVENTS).not.toContain("task.updated");
    expect(MY_WORK_EVENTS).not.toContain("task.due_date_changed");
  });

  it("tells both sides of an assignment change and nobody else", async () => {
    const added = makeFakeWs();
    const removed = makeFakeWs();
    const bystander = makeFakeWs();

    const connA = addUserConnection("ana", added);
    const connB = addUserConnection("luis", removed);
    const connC = addUserConnection("marta", bystander);

    await fire("task.assignees_changed", {
      taskId: "task-1",
      projectId: "project-1",
      addedIds: ["ana"],
      removedIds: ["luis"],
    });

    await vi.waitFor(
      () => {
        expect(sendMock(added)).toHaveBeenCalled();
        expect(sendMock(removed)).toHaveBeenCalled();
      },
      { timeout: 300 },
    );

    expect(JSON.parse(sendMock(added).mock.calls[0][0]).type).toBe(
      "MY_WORK_INVALIDATED",
    );
    expect(sendMock(bystander)).not.toHaveBeenCalled();

    removeUserConnection("ana", connA);
    removeUserConnection("luis", connB);
    removeUserConnection("marta", connC);
  });

  // La regresion que mas probable era: sin `previousAssigneeId` en la carga
  // util, quien pierde la tarea no recibe nada y se le queda en la pagina.
  it("tells the person who just lost the task", async () => {
    const ws = makeFakeWs();
    const conn = addUserConnection("ana", ws);

    await fire("task.unassigned", {
      taskId: "task-1",
      projectId: "project-1",
      previousAssigneeId: "ana",
    });

    await vi.waitFor(
      () => {
        expect(sendMock(ws)).toHaveBeenCalled();
      },
      { timeout: 300 },
    );

    expect(JSON.parse(sendMock(ws).mock.calls[0][0]).type).toBe(
      "MY_WORK_INVALIDATED",
    );

    removeUserConnection("ana", conn);
  });

  it("tells the members of a team that stops owning the task", async () => {
    mockWhere.mockResolvedValue([{ userId: "ana" }]);

    const ws = makeFakeWs();
    const conn = addUserConnection("ana", ws);

    await fire("task.team_unassigned", {
      taskId: "task-1",
      projectId: "project-1",
      oldTeamId: "team-a",
    });

    await vi.waitFor(
      () => {
        expect(sendMock(ws)).toHaveBeenCalled();
      },
      { timeout: 300 },
    );

    removeUserConnection("ana", conn);
  });
});
