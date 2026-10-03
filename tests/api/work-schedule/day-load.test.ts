import { describe, expect, it } from "vitest";
import { dayLoad } from "../../../apps/api/src/work-schedule/day-load";

const HOUR = 3600;

describe("dayLoad", () => {
  it("adds what is left of each task to the fixed blocks", () => {
    expect(
      dayLoad({
        entries: [
          { estimate: 2 * HOUR, loggedSeconds: 0.5 * HOUR, isDone: false },
          { estimate: HOUR, loggedSeconds: 0, isDone: false },
        ],
        fixedBlocks: [{ startMinute: 600, endMinute: 660 }],
        capacitySeconds: 8 * HOUR,
      }),
    ).toEqual({ loadSeconds: 3.5 * HOUR, capacitySeconds: 8 * HOUR, pct: 44 });
  });

  it("never counts negative remaining time", () => {
    expect(
      dayLoad({
        entries: [{ estimate: HOUR, loggedSeconds: 3 * HOUR, isDone: false }],
        fixedBlocks: [],
        capacitySeconds: 8 * HOUR,
      }).loadSeconds,
    ).toBe(0);
  });

  it("leaves done tasks and unestimated ones out of the load", () => {
    expect(
      dayLoad({
        entries: [
          { estimate: 4 * HOUR, loggedSeconds: 0, isDone: true },
          { estimate: null, loggedSeconds: 0, isDone: false },
        ],
        fixedBlocks: [],
        capacitySeconds: 8 * HOUR,
      }),
    ).toEqual({ loadSeconds: 0, capacitySeconds: 8 * HOUR, pct: 0 });
  });

  it("reads as full on a day without capacity that still has load", () => {
    expect(
      dayLoad({
        entries: [{ estimate: HOUR, loggedSeconds: 0, isDone: false }],
        fixedBlocks: [],
        capacitySeconds: 0,
      }).pct,
    ).toBe(100);
    expect(
      dayLoad({ entries: [], fixedBlocks: [], capacitySeconds: 0 }).pct,
    ).toBe(0);
  });
});
