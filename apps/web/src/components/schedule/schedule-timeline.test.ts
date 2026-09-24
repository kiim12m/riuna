import { describe, expect, it } from "vitest";
import {
  clampMinute,
  formatClock,
  hourMarks,
  minuteAtOffset,
  minutesToPx,
  PX_PER_MINUTE,
  pxToMinutes,
  resizeSegment,
  secondsToPx,
  snapMinute,
} from "./schedule-timeline";

describe("minutesToPx / pxToMinutes", () => {
  it("round-trips through the scale", () => {
    expect(minutesToPx(60)).toBe(60 * PX_PER_MINUTE);
    expect(pxToMinutes(minutesToPx(90))).toBe(90);
  });
});

describe("secondsToPx", () => {
  it("converts seconds through minutes", () => {
    expect(secondsToPx(120)).toBe(minutesToPx(2));
  });
});

describe("snapMinute", () => {
  it("rounds to the nearest 5 minutes by default", () => {
    expect(snapMinute(482)).toBe(480);
    expect(snapMinute(483)).toBe(485);
  });

  it("rounds to a custom step", () => {
    expect(snapMinute(487, 15)).toBe(480);
    expect(snapMinute(488, 15)).toBe(495);
  });
});

describe("minuteAtOffset", () => {
  it("snaps to 15 minutes and adds the grid's start offset", () => {
    // 542 px / 1.4 px-per-min ~= 387.1 min -> snapped to 390 (06:30)
    expect(minuteAtOffset(minutesToPx(387), 0)).toBe(390);
    expect(minuteAtOffset(minutesToPx(387), 8 * 60)).toBe(8 * 60 + 390);
  });
});

describe("clampMinute", () => {
  it("keeps a value inside the range", () => {
    expect(clampMinute(10, 480, 1080)).toBe(480);
    expect(clampMinute(2000, 480, 1080)).toBe(1080);
    expect(clampMinute(600, 480, 1080)).toBe(600);
  });
});

describe("formatClock", () => {
  it("pads hours and minutes", () => {
    expect(formatClock(0)).toBe("00:00");
    expect(formatClock(9 * 60 + 5)).toBe("09:05");
    expect(formatClock(23 * 60 + 59)).toBe("23:59");
  });
});

describe("resizeSegment", () => {
  const bounds = { min: 0, max: 1440, minDuration: 10 };

  it("dragging the bottom edge only changes the duration", () => {
    const result = resizeSegment("bottom", 9 * 60, 30, minutesToPx(20), bounds);
    expect(result).toEqual({ startMinute: 9 * 60, durationMinutes: 50 });
  });

  it("dragging the bottom edge up shortens it, never below the minimum", () => {
    const result = resizeSegment(
      "bottom",
      9 * 60,
      15,
      -minutesToPx(30),
      bounds,
    );
    expect(result).toEqual({ startMinute: 9 * 60, durationMinutes: 10 });
  });

  it("dragging the top edge moves the start and keeps the end fixed", () => {
    const result = resizeSegment("top", 9 * 60, 30, -minutesToPx(15), bounds);
    // End stays at 9:30; start moves to 8:45, duration grows to 45.
    expect(result).toEqual({ startMinute: 9 * 60 - 15, durationMinutes: 45 });
  });

  it("dragging the top edge down never crosses the minimum duration", () => {
    const result = resizeSegment("top", 9 * 60, 15, minutesToPx(30), bounds);
    // End stays at 9:15; start cannot pass 9:05 (10-minute minimum).
    expect(result).toEqual({
      startMinute: 9 * 60 + 5,
      durationMinutes: 10,
    });
  });

  it("snaps the drag delta to 5 minutes", () => {
    const result = resizeSegment("bottom", 9 * 60, 30, minutesToPx(17), bounds);
    expect(result.durationMinutes).toBe(45); // 30 + snap(17) = 30 + 15
  });

  it("never grows past the day boundary", () => {
    const result = resizeSegment(
      "bottom",
      23 * 60,
      30,
      minutesToPx(120),
      bounds,
    );
    expect(result.durationMinutes).toBe(60); // capped at bounds.max=1440
  });
});

describe("hourMarks", () => {
  it("lists every whole hour inside the range", () => {
    expect(hourMarks(8 * 60, 11 * 60)).toEqual([480, 540, 600, 660]);
  });

  it("starts at the next whole hour when the range doesn't start on one", () => {
    expect(hourMarks(8 * 60 + 30, 10 * 60)).toEqual([540, 600]);
  });
});
