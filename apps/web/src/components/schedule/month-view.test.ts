import { describe, expect, it } from "vitest";
import type { ScheduleDay, ScheduleSegment } from "@/fetchers/schedule";
import { itemsFor } from "./month-view";

/** Solo los campos que `itemsFor` mira. */
function day(segments: ScheduleSegment[]): ScheduleDay {
  return {
    dayDate: "2026-09-24",
    isToday: false,
    segments,
    overflow: [],
    ghosts: [],
  } as unknown as ScheduleDay;
}

function runningBlock(startSecond: number, endSecond: number): ScheduleSegment {
  return {
    type: "block",
    startSecond,
    endSecond,
    entries: [{ id: "timer", title: "", kind: "running", block: null }],
  } as unknown as ScheduleSegment;
}

function mergedWithRunning(
  startSecond: number,
  endSecond: number,
): ScheduleSegment {
  // El cronometro ordena primero (empezo antes) y se funde con un bloque
  // real que se solapa -el caso que escondia el bloque entero.
  return {
    type: "block",
    startSecond,
    endSecond,
    entries: [
      { id: "timer", title: "", kind: "running", block: null },
      { id: "b1", title: "Comida", kind: "break", block: { id: "b1" } },
    ],
  } as unknown as ScheduleSegment;
}

describe("itemsFor", () => {
  it("returns nothing for an undefined day", () => {
    expect(itemsFor(undefined)).toEqual([]);
  });

  it("drops a segment that is only the running timer", () => {
    const items = itemsFor(day([runningBlock(9 * 3600, 10 * 3600)]));
    expect(items).toHaveLength(0);
  });

  it("keeps a real block merged with the running timer", () => {
    // Antes de esta correccion, mirar solo `entries[0]` -el cronometro,
    // que ordena primero- escondia el bloque real entero.
    const items = itemsFor(day([mergedWithRunning(9 * 3600, 10 * 3600)]));
    expect(items).toHaveLength(1);
    expect(items[0]?.kind).toBe("block");
  });
});
