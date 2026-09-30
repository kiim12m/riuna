import { describe, expect, it } from "vitest";
import {
  capacityForDay,
  dayCapacitySeconds,
  isWorkDay,
} from "../../../apps/api/src/work-schedule/day-capacity";
import type { WorkSchedule } from "../../../apps/api/src/work-schedule/get-work-schedule";

const H = 60;

/** Lunes 5 de enero de 2026 -un dia laborable seguro para las pruebas-. */
const MONDAY = new Date(2026, 0, 5);
/** Domingo 4 de enero de 2026. */
const SUNDAY = new Date(2026, 0, 4);

const DEFAULT: WorkSchedule = {
  workStartMinute: 9 * H,
  workEndMinute: 17 * H,
  lunchEnabled: false,
  lunchStartMinute: null,
  lunchEndMinute: null,
  workDays: 0b0_111_110, // lunes a viernes
};

describe("isWorkDay", () => {
  it("treats Monday-Friday as work days by default", () => {
    expect(isWorkDay(DEFAULT, MONDAY)).toBe(true);
  });

  it("treats Sunday as not a work day by default", () => {
    expect(isWorkDay(DEFAULT, SUNDAY)).toBe(false);
  });

  it("reads an arbitrary mask bit for bit", () => {
    // Solo domingo (bit 0).
    const sundayOnly: WorkSchedule = { ...DEFAULT, workDays: 0b1 };
    expect(isWorkDay(sundayOnly, SUNDAY)).toBe(true);
    expect(isWorkDay(sundayOnly, MONDAY)).toBe(false);
  });
});

describe("dayCapacitySeconds", () => {
  it("is 0 on a day that is not a work day, regardless of hours", () => {
    expect(dayCapacitySeconds(DEFAULT, SUNDAY, [])).toBe(0);
  });

  it("is the full work day when there is no lunch and no breaks", () => {
    expect(dayCapacitySeconds(DEFAULT, MONDAY, [])).toBe(8 * 3600);
  });

  it("subtracts an enabled lunch break", () => {
    const withLunch: WorkSchedule = {
      ...DEFAULT,
      lunchEnabled: true,
      lunchStartMinute: 13 * H,
      lunchEndMinute: 14 * H,
    };
    expect(dayCapacitySeconds(withLunch, MONDAY, [])).toBe(7 * 3600);
  });

  it("ignores lunch times when lunch is disabled", () => {
    const lunchOff: WorkSchedule = {
      ...DEFAULT,
      lunchEnabled: false,
      lunchStartMinute: 13 * H,
      lunchEndMinute: 14 * H,
    };
    expect(dayCapacitySeconds(lunchOff, MONDAY, [])).toBe(8 * 3600);
  });

  it("subtracts a closed schedule block", () => {
    const breakInterval = [{ startMinute: 10 * H, endMinute: 10 * H + 30 }];
    expect(dayCapacitySeconds(DEFAULT, MONDAY, breakInterval)).toBe(
      8 * 3600 - 30 * 60,
    );
  });

  it("unions an overlapping lunch and closed block instead of double-subtracting", () => {
    const withLunch: WorkSchedule = {
      ...DEFAULT,
      lunchEnabled: true,
      lunchStartMinute: 13 * H,
      lunchEndMinute: 14 * H,
    };
    // Se solapa 30 min con la comida (13:30-14:30).
    const breakInterval = [
      { startMinute: 13 * H + 30, endMinute: 14 * H + 30 },
    ];

    // Union real: 13:00-14:30, 90 min, no los 120 min que darian sumados
    // por separado.
    expect(dayCapacitySeconds(withLunch, MONDAY, breakInterval)).toBe(
      8 * 3600 - 90 * 60,
    );
  });

  it("clips a block that starts before the work day to the work day bounds", () => {
    const breakInterval = [{ startMinute: 0, endMinute: 10 * H }];
    // De 09:00 a 10:00 es lo unico dentro de la jornada.
    expect(dayCapacitySeconds(DEFAULT, MONDAY, breakInterval)).toBe(7 * 3600);
  });

  it("clips a block that ends after the work day to the work day bounds", () => {
    const breakInterval = [{ startMinute: 16 * H, endMinute: 20 * H }];
    // De 16:00 a 17:00 es lo unico dentro de la jornada.
    expect(dayCapacitySeconds(DEFAULT, MONDAY, breakInterval)).toBe(7 * 3600);
  });

  it("never goes negative when breaks cover the whole day", () => {
    const breakInterval = [{ startMinute: 0, endMinute: 24 * H }];
    expect(dayCapacitySeconds(DEFAULT, MONDAY, breakInterval)).toBe(0);
  });
});

describe("capacityForDay", () => {
  it("subtracts only the 'break' blocks of the day, ignoring 'fixed' ones", () => {
    const dayBlocks = [
      { kind: "break", startMinute: 10 * H, endMinute: 10 * H + 30 },
      { kind: "fixed", startMinute: 11 * H, endMinute: 12 * H },
    ];
    expect(capacityForDay(DEFAULT, MONDAY, dayBlocks)).toBe(8 * 3600 - 30 * 60);
  });

  it("matches dayCapacitySeconds given the same break intervals", () => {
    const dayBlocks = [
      { kind: "break", startMinute: 13 * H, endMinute: 13 * H + 45 },
    ];
    expect(capacityForDay(DEFAULT, MONDAY, dayBlocks)).toBe(
      dayCapacitySeconds(DEFAULT, MONDAY, [
        { startMinute: 13 * H, endMinute: 13 * H + 45 },
      ]),
    );
  });
});
