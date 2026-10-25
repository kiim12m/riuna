import { afterEach, describe, expect, it, vi } from "vitest";

// Auditoria 1.4: el apagado cerraba el servidor sin esperar y salia en el acto,
// y el bus de eventos tenia su propio SIGTERM que quitaba los oyentes. Lo que
// estuviera a medias —una peticion, un gestor de eventos— se cortaba.

const calls: string[] = [];

vi.mock("../../apps/api/src/scheduler", () => ({
  shutdownScheduler: vi.fn(async () => {
    calls.push("scheduler");
  }),
}));
vi.mock("../../apps/api/src/ws", () => ({
  closeLocalConnections: vi.fn(() => {
    calls.push("sockets");
  }),
  shutdownWebSocketAdapter: vi.fn(async () => {
    calls.push("adapter");
  }),
}));
vi.mock("../../apps/api/src/database", () => ({
  closeDatabasePool: vi.fn(async () => {
    calls.push("pool");
  }),
}));

const sigtermBefore = process.listenerCount("SIGTERM");
const { publishEvent, subscribeToEvent, shutdownEventBus } = await import(
  "../../apps/api/src/events"
);
const { gracefulShutdown } = await import("../../apps/api/src/shutdown");

function fakeServer(closeAfterMs: number | null) {
  return {
    close: vi.fn((callback: () => void) => {
      calls.push("close");
      if (closeAfterMs !== null) {
        setTimeout(() => {
          calls.push("closed");
          callback();
        }, closeAfterMs);
      }
    }),
    closeAllConnections: vi.fn(() => {
      calls.push("force");
    }),
  };
}

afterEach(async () => {
  calls.length = 0;
  await shutdownEventBus();
});

describe("gracefulShutdown", () => {
  it("does not register its own SIGTERM in the event bus", () => {
    expect(process.listenerCount("SIGTERM")).toBe(sigtermBefore);
  });

  it("waits for in-flight requests and event handlers before closing the pool", async () => {
    await subscribeToEvent("test.slow", async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      calls.push("handler");
    });
    await publishEvent("test.slow", {});

    await gracefulShutdown({ server: fakeServer(20), timeoutMs: 1_000 });

    expect(calls).toEqual([
      "sockets",
      "close",
      "closed",
      "scheduler",
      "handler",
      "adapter",
      "pool",
    ]);
  });

  it("forces the open connections once the deadline passes", async () => {
    const server = fakeServer(null);

    await gracefulShutdown({ server, timeoutMs: 30 });

    expect(server.closeAllConnections).toHaveBeenCalled();
    expect(calls.at(-1)).toBe("pool");
  });
});
