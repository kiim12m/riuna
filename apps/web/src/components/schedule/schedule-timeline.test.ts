import { describe, expect, it } from "vitest";
import {
  clampMinute,
  formatClock,
  hourMarks,
  minutesToPx,
  PX_PER_MINUTE,
  pxToMinutes,
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
  it("rounds to the nearest 5 minutes", () => {
    expect(snapMinute(482)).toBe(480);
    expect(snapMinute(483)).toBe(485);
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

describe("hourMarks", () => {
  it("lists every whole hour inside the range", () => {
    expect(hourMarks(8 * 60, 11 * 60)).toEqual([480, 540, 600, 660]);
  });

  it("starts at the next whole hour when the range doesn't start on one", () => {
    expect(hourMarks(8 * 60 + 30, 10 * 60)).toEqual([540, 600]);
  });
});
