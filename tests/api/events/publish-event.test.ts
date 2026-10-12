import { afterEach, describe, expect, it, vi } from "vitest";
import {
  eventContext,
  publishEvent,
  publishEventsPaced,
  shutdownEventBus,
  subscribeToEvent,
} from "../../../apps/api/src/events/index";
import { log } from "../../../apps/api/src/utils/log";

describe("publishEvent / subscribeToEvent", () => {
  afterEach(async () => {
    await shutdownEventBus();
  });

  it("delivers event data to a subscriber", async () => {
    const received: unknown[] = [];

    await subscribeToEvent("test.event", async (data) => {
      received.push(data);
    });

    await publishEvent("test.event", { foo: "bar" });

    // EventEmitter is synchronous so handler runs inline
    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({ foo: "bar" });
  });

  it("attaches initiatorId from eventContext store", async () => {
    const received: Array<{ initiatorId?: string }> = [];

    await subscribeToEvent<{ initiatorId?: string }>(
      "test.initiator",
      async (data) => {
        received.push(data);
      },
    );

    await eventContext.run({ initiatorId: "user-abc" }, async () => {
      await publishEvent("test.initiator", { taskId: "t1" });
    });

    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({
      taskId: "t1",
      initiatorId: "user-abc",
    });
  });

  it("sets initiatorId to undefined when no eventContext store exists", async () => {
    const received: Array<{ initiatorId?: string }> = [];

    await subscribeToEvent<{ initiatorId?: string }>(
      "test.no-context",
      async (data) => {
        received.push(data);
      },
    );

    await publishEvent("test.no-context", { taskId: "t2" });

    expect(received).toHaveLength(1);
    expect(received[0]?.initiatorId).toBeUndefined();
  });

  it("does not deliver events to unrelated subscribers", async () => {
    const received: unknown[] = [];

    await subscribeToEvent("other.event", async (data) => {
      received.push(data);
    });

    await publishEvent("test.unrelated", { value: 1 });

    expect(received).toHaveLength(0);
  });

  it("handles non-object data without attaching initiatorId", async () => {
    const received: unknown[] = [];

    await subscribeToEvent("test.primitive", async (data) => {
      received.push(data);
    });

    await publishEvent("test.primitive", "just a string");

    expect(received).toHaveLength(1);
    expect(received[0]).toBe("just a string");
  });

  it("shutdownEventBus removes all listeners", async () => {
    const received: unknown[] = [];

    await subscribeToEvent("test.shutdown", async (data) => {
      received.push(data);
    });

    await shutdownEventBus();
    await publishEvent("test.shutdown", { after: true });

    expect(received).toHaveLength(0);
  });
});

describe("publishEventsPaced", () => {
  afterEach(async () => {
    await shutdownEventBus();
  });

  it("never runs more than a batch of handlers at once, and runs them all", async () => {
    let running = 0;
    let peak = 0;
    let done = 0;
    await subscribeToEvent("paced.test", async () => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, 5));
      running--;
      done++;
    });

    await publishEventsPaced(
      Array.from({ length: 45 }, (_, index) => ({
        type: "paced.test",
        data: { index },
      })),
      10,
    );

    expect(done).toBe(45);
    expect(peak).toBeLessThanOrEqual(10);
  });

  it("settles when a handler fails: the others still finish", async () => {
    const { publishEventsPaced, subscribeToEvent } = await import(
      "../../../apps/api/src/events"
    );
    const errors = vi.spyOn(log, "error").mockImplementation(() => {});
    let ok = 0;
    await subscribeToEvent<{ fail: boolean }>("paced.fail", async (data) => {
      if (data.fail) throw new Error("boom");
      ok++;
    });

    await publishEventsPaced(
      [
        { type: "paced.fail", data: { fail: true } },
        { type: "paced.fail", data: { fail: false } },
      ],
      5,
    );

    expect(ok).toBe(1);
    expect(errors).toHaveBeenCalled();
    errors.mockRestore();
  });

  it("waits only for its own handlers, not for a slow one from another request", async () => {
    let done = 0;
    await subscribeToEvent("paced.own", async () => {
      done++;
    });
    await subscribeToEvent("other.slow", async () => {
      // Un webhook que no contesta nunca.
      await new Promise(() => {});
    });

    await publishEvent("other.slow", {});

    const finished = await Promise.race([
      publishEventsPaced(
        Array.from({ length: 30 }, () => ({ type: "paced.own", data: {} })),
        10,
      ).then(() => "finished"),
      new Promise((resolve) => setTimeout(() => resolve("stuck"), 500)),
    ]);

    expect(finished).toBe("finished");
    expect(done).toBe(30);
  });
});
