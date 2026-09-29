import { describe, expect, it } from "vitest";
import type { ScheduleSegment } from "@/fetchers/schedule";
import { nearestBlockBounds } from "./time-grid";

/** Solo los campos que `nearestBlockBounds` mira -`type`, `startSecond`,
 * `endSecond`-; el resto no le hace falta para decidir un limite. */
function block(startSecond: number, endSecond: number): ScheduleSegment {
  return {
    type: "block",
    startSecond,
    endSecond,
    entries: [],
  } as unknown as ScheduleSegment;
}

function flow(startSecond: number, endSecond: number): ScheduleSegment {
  return {
    type: "flow",
    taskId: "task",
    startSecond,
    endSecond,
    part: 0,
    truncated: false,
    task: null,
  } as unknown as ScheduleSegment;
}

describe("nearestBlockBounds", () => {
  it("defaults to the day's boundaries with no blocks around", () => {
    const segments = [flow(9 * 3600, 10 * 3600)];
    expect(nearestBlockBounds(segments, 0)).toEqual({ min: 0, max: 1440 });
  });

  it("clamps to the nearest block on each side, not to other flow segments", () => {
    // Comida 13:00-14:00, con una tarea partida a cada lado.
    const segments = [
      flow(9 * 3600, 13 * 3600),
      block(13 * 3600, 14 * 3600),
      flow(14 * 3600, 15 * 3600),
    ];
    expect(nearestBlockBounds(segments, 0)).toEqual({ min: 0, max: 13 * 60 });
    expect(nearestBlockBounds(segments, 2)).toEqual({
      min: 14 * 60,
      max: 1440,
    });
  });

  it("skips past a non-block segment to find the real boundary", () => {
    const segments = [
      block(8 * 3600, 9 * 3600),
      flow(9 * 3600, 10 * 3600),
      flow(10 * 3600, 11 * 3600),
    ];
    // Para el segmento en el indice 2, el mas cercano hacia atras no es el
    // `flow` del indice 1 -no es un bloque, se salta-, sino el bloque de
    // las 8-9 del indice 0.
    expect(nearestBlockBounds(segments, 2)).toEqual({
      min: 9 * 60,
      max: 1440,
    });
  });
});
