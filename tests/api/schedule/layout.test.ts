import { describe, expect, it } from "vitest";
import { layoutDay } from "../../../apps/api/src/schedule/layout";

const H = 3600;
const DAY_START = 8 * H;
const DAY_END = 18 * H;

describe("layoutDay", () => {
  it("places flowing entries back to back from the start of the day", () => {
    const { segments, overflow } = layoutDay({
      flowEntries: [
        {
          taskId: "a",
          estimateSeconds: H,
          position: 0,
          pinnedStartSecond: null,
        },
        {
          taskId: "b",
          estimateSeconds: H * 2,
          position: 1,
          pinnedStartSecond: null,
        },
      ],
      blockers: [],
      dayStartSecond: DAY_START,
      dayEndSecond: DAY_END,
    });

    expect(overflow).toEqual([]);
    expect(segments).toEqual([
      {
        type: "flow",
        taskId: "a",
        startSecond: DAY_START,
        endSecond: DAY_START + H,
        part: 0,
        truncated: false,
      },
      {
        type: "flow",
        taskId: "b",
        startSecond: DAY_START + H,
        endSecond: DAY_START + H * 3,
        part: 0,
        truncated: false,
      },
    ]);
  });

  it("splits a flowing entry around a fixed block that falls inside it", () => {
    const { segments } = layoutDay({
      flowEntries: [
        {
          taskId: "a",
          estimateSeconds: H * 2,
          position: 0,
          pinnedStartSecond: null,
        },
      ],
      blockers: [
        {
          id: "lunch",
          kind: "break",
          title: "Comida",
          startSecond: DAY_START + H / 2,
          endSecond: DAY_START + H,
        },
      ],
      dayStartSecond: DAY_START,
      dayEndSecond: DAY_END,
    });

    const flowParts = segments.filter((s) => s.type === "flow");
    expect(flowParts).toEqual([
      {
        type: "flow",
        taskId: "a",
        startSecond: DAY_START,
        endSecond: DAY_START + H / 2,
        part: 0,
        truncated: false,
      },
      {
        type: "flow",
        taskId: "a",
        startSecond: DAY_START + H,
        endSecond: DAY_START + H * 2.5,
        part: 1,
        truncated: false,
      },
    ]);
    // El bloque fijo se ve una vez, entre las dos mitades.
    expect(segments.find((s) => s.type === "block")).toMatchObject({
      startSecond: DAY_START + H / 2,
      endSecond: DAY_START + H,
    });
  });

  it("sends what doesn't fit before the end of the day to overflow, not to tomorrow", () => {
    const { segments, overflow } = layoutDay({
      flowEntries: [
        {
          taskId: "a",
          estimateSeconds: H,
          position: 0,
          pinnedStartSecond: null,
        },
      ],
      blockers: [],
      dayStartSecond: DAY_END - H / 2,
      dayEndSecond: DAY_END,
    });

    expect(overflow).toEqual([{ taskId: "a", remainingSeconds: H / 2 }]);
    const flowPart = segments.find((s) => s.type === "flow");
    expect(flowPart).toMatchObject({
      startSecond: DAY_END - H / 2,
      endSecond: DAY_END,
      truncated: true,
    });
  });

  it("routes flowing entries around a pinned entry", () => {
    const { segments } = layoutDay({
      flowEntries: [
        {
          taskId: "flow",
          estimateSeconds: H,
          position: 0,
          pinnedStartSecond: null,
        },
        {
          taskId: "pinned",
          estimateSeconds: H,
          position: 99,
          pinnedStartSecond: DAY_START,
        },
      ],
      blockers: [],
      dayStartSecond: DAY_START,
      dayEndSecond: DAY_END,
    });

    expect(segments).toEqual([
      {
        type: "pinned",
        taskId: "pinned",
        startSecond: DAY_START,
        endSecond: DAY_START + H,
        conflict: false,
      },
      {
        type: "flow",
        taskId: "flow",
        startSecond: DAY_START + H,
        endSecond: DAY_START + H * 2,
        part: 0,
        truncated: false,
      },
    ]);
  });

  it("flags a pinned entry that overlaps a fixed block as a conflict", () => {
    const { segments } = layoutDay({
      flowEntries: [
        {
          taskId: "pinned",
          estimateSeconds: H,
          position: 0,
          pinnedStartSecond: DAY_START,
        },
      ],
      blockers: [
        {
          id: "visit",
          kind: "fixed",
          title: "Visita de obra",
          startSecond: DAY_START + H / 2,
          endSecond: DAY_START + H * 1.5,
        },
      ],
      dayStartSecond: DAY_START,
      dayEndSecond: DAY_END,
    });

    expect(segments.find((s) => s.type === "pinned")).toMatchObject({
      conflict: true,
    });
  });

  it("merges two overlapping fixed blocks into one, keeping both entries", () => {
    const { segments } = layoutDay({
      flowEntries: [],
      blockers: [
        {
          id: "a",
          kind: "fixed",
          title: "Visita A",
          startSecond: DAY_START,
          endSecond: DAY_START + H,
        },
        {
          id: "b",
          kind: "fixed",
          title: "Visita B",
          startSecond: DAY_START + H / 2,
          endSecond: DAY_START + H * 2,
        },
      ],
      dayStartSecond: DAY_START,
      dayEndSecond: DAY_END,
    });

    expect(segments).toEqual([
      {
        type: "block",
        startSecond: DAY_START,
        endSecond: DAY_START + H * 2,
        entries: [
          { id: "a", title: "Visita A", kind: "fixed" },
          { id: "b", title: "Visita B", kind: "fixed" },
        ],
      },
    ]);
  });
});
