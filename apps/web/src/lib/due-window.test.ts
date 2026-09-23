import { describe, expect, it } from "vitest";
import { DUE_WINDOW_ORDER, groupByDueWindow } from "./due-window";

describe("DUE_WINDOW_ORDER", () => {
  it("lists every window exactly once, most urgent first", () => {
    expect(DUE_WINDOW_ORDER).toEqual([
      "overdue",
      "today",
      "week",
      "later",
      "none",
    ]);
  });
});

describe("groupByDueWindow", () => {
  it("buckets items by the window the caller resolves for them", () => {
    const items = [
      { id: "a", dueWindow: "today" as const },
      { id: "b", dueWindow: "overdue" as const },
      { id: "c", dueWindow: "today" as const },
    ];

    const groups = groupByDueWindow(items, (item) => item.dueWindow);

    expect(groups.today.map((item) => item.id)).toEqual(["a", "c"]);
    expect(groups.overdue.map((item) => item.id)).toEqual(["b"]);
    expect(groups.week).toEqual([]);
    expect(groups.later).toEqual([]);
    expect(groups.none).toEqual([]);
  });

  it("returns every bucket even when nothing lands in it", () => {
    const groups = groupByDueWindow<{ dueWindow: "none" }>(
      [],
      (item) => item.dueWindow,
    );

    expect(Object.keys(groups).sort()).toEqual([...DUE_WINDOW_ORDER].sort());
  });
});
