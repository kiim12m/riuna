import { describe, expect, it } from "vitest";
import {
  barHeightRem,
  barMetrics,
  buildHeaderBands,
  buildTimeline,
  dayOffsetPx,
  isZoomLevel,
  MIN_BAR_PX,
} from "./gantt-timeline";

const rangeStart = new Date(2026, 8, 1); // 1 Sep 2026
const rangeEnd = new Date(2026, 10, 1); // 1 Nov 2026 -> 61 days

describe("isZoomLevel", () => {
  it("accepts the four levels and rejects everything else", () => {
    expect(isZoomLevel("day")).toBe(true);
    expect(isZoomLevel("quarter")).toBe(true);
    expect(isZoomLevel("year")).toBe(false);
    expect(isZoomLevel(undefined)).toBe(false);
  });
});

describe("buildTimeline", () => {
  it("counts calendar days and scales width by zoom", () => {
    const day = buildTimeline(rangeStart, rangeEnd, "day");
    expect(day.totalDays).toBe(61);
    expect(day.pixelsPerDay).toBe(40);
    expect(day.trackWidthPx).toBe(61 * 40);

    const week = buildTimeline(rangeStart, rangeEnd, "week");
    expect(week.pixelsPerDay).toBeCloseTo(132 / 7);
    expect(week.trackWidthPx).toBeCloseTo(61 * (132 / 7));

    const quarter = buildTimeline(rangeStart, rangeEnd, "quarter");
    expect(quarter.pixelsPerDay).toBeLessThan(week.pixelsPerDay);
  });

  it("never reports fewer than one day", () => {
    expect(buildTimeline(rangeStart, rangeStart, "day").totalDays).toBe(1);
  });
});

describe("dayOffsetPx / barMetrics", () => {
  const timeline = buildTimeline(rangeStart, rangeEnd, "day");

  it("offsets from the range start", () => {
    expect(dayOffsetPx(rangeStart, timeline)).toBe(0);
    expect(dayOffsetPx(new Date(2026, 8, 11), timeline)).toBe(10 * 40);
  });

  it("anchors a bar at the middle of the first and last day", () => {
    // 10 Sep is index 9, 12 Sep is index 11; half a day is 20px.
    const { left, width } = barMetrics(
      new Date(2026, 8, 10),
      new Date(2026, 8, 12),
      timeline,
    );
    expect(left).toBe(9 * 40 + 20);
    expect(width).toBe(2 * 40);
  });

  it("draws a single-day task as a dot centred on its day", () => {
    const day = new Date(2026, 8, 10);
    const { left, width } = barMetrics(day, day, timeline);
    const centre = 9 * 40 + 20;
    expect(width).toBe(MIN_BAR_PX);
    expect(left + width / 2).toBe(centre);
  });

  it("keeps the minimum width when the zoom squeezes a bar below it", () => {
    const tiny = buildTimeline(rangeStart, rangeEnd, "quarter");
    const { width } = barMetrics(
      new Date(2026, 8, 10),
      new Date(2026, 8, 12),
      tiny,
    );
    expect(width).toBe(MIN_BAR_PX);
  });
});

describe("barHeightRem", () => {
  it("uses exactly two thicknesses: root task and any subtask", () => {
    expect(barHeightRem(0)).toBe("0.625rem");
    expect(barHeightRem(1)).toBe("0.375rem");
    expect(barHeightRem(2)).toBe(barHeightRem(1));
    expect(barHeightRem(9)).toBe(barHeightRem(1));
  });
});

describe("buildHeaderBands", () => {
  const today = new Date(2026, 8, 15);
  // Stub del traductor: `buildHeaderBands` solo lo usa para la etiqueta de trimestre.
  const t = (_key: string, options?: Record<string, unknown>) =>
    `Q${options?.n ?? ""}`;

  it("day zoom: months on top, one cell per day, weekly gridlines, today marked", () => {
    const timeline = buildTimeline(rangeStart, rangeEnd, "day");
    const bands = buildHeaderBands(timeline, "day", 1, today, t);

    expect(bands.bottom).toHaveLength(61);
    expect(bands.top).toHaveLength(2);
    expect(bands.bottom.map((s) => s.label).slice(0, 3)).toEqual([
      "1",
      "2",
      "3",
    ]);
    expect(bands.bottom.filter((s) => s.isCurrent)).toHaveLength(1);
    // 1 Sep 2026 is a Tuesday; first Monday is the 7th -> gridline at index 6.
    expect(bands.gridlines[0]?.leftPx).toBe(6 * timeline.pixelsPerDay);
  });

  it("month zoom: one year on top, one bottom cell per month touched", () => {
    // 1 Sep -> 15 Nov toca septiembre, octubre y noviembre.
    const timeline = buildTimeline(
      new Date(2026, 8, 1),
      new Date(2026, 10, 15),
      "month",
    );
    const bands = buildHeaderBands(timeline, "month", 1, today, t);
    expect(bands.top).toHaveLength(1);
    expect(bands.bottom).toHaveLength(3);
    expect(bands.bottom.filter((s) => s.isCurrent)).toHaveLength(1);
  });

  it("quarter zoom: one label per quarter, via the translator", () => {
    const wide = buildTimeline(
      new Date(2026, 0, 1),
      new Date(2027, 0, 1),
      "quarter",
    );
    const bands = buildHeaderBands(wide, "quarter", 1, today, t);
    expect(bands.bottom.map((s) => s.label)).toEqual(["Q1", "Q2", "Q3", "Q4"]);
  });
});
