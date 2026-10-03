import { describe, expect, it } from "vitest";
import { type AnchoredEntry, dueReminders } from "./due-reminders";

const at10 = "2026-10-02T08:00:00.000Z"; // 10:00 en Madrid
const tenOClock = new Date(at10).getTime();
const minute = 60 * 1000;

function entry(overrides: Partial<AnchoredEntry> = {}): AnchoredEntry {
  return {
    id: "t1",
    title: "Llamar al proveedor",
    startsAt: at10,
    isDone: false,
    ...overrides,
  };
}

function due(
  entries: AnchoredEntry[],
  now: number,
  fired: string[] = [],
  snoozedUntil: Record<string, number> = {},
) {
  return dueReminders(entries, { now, fired: new Set(fired), snoozedUntil });
}

describe("dueReminders", () => {
  it("fires at the anchored time, not before", () => {
    expect(due([entry()], tenOClock - 1)).toEqual([]);
    expect(due([entry()], tenOClock).map((reminder) => reminder.key)).toEqual([
      `anchor:t1:${at10}`,
    ]);
  });

  it("fires only once", () => {
    expect(due([entry()], tenOClock + minute, [`anchor:t1:${at10}`])).toEqual(
      [],
    );
  });

  it("lets an old anchor go after the window", () => {
    expect(due([entry()], tenOClock + 14 * minute)).toHaveLength(1);
    expect(due([entry()], tenOClock + 16 * minute)).toEqual([]);
  });

  it("skips what is done or has no time", () => {
    expect(
      due(
        [entry({ isDone: true }), entry({ id: "t2", startsAt: null })],
        tenOClock,
      ),
    ).toEqual([]);
  });

  it("fires again, once, when a snooze ends", () => {
    const until = tenOClock + 10 * minute;
    const fired = [`anchor:t1:${at10}`];

    expect(
      due([entry()], tenOClock + 5 * minute, fired, { t1: until }),
    ).toEqual([]);
    const again = due([entry()], until, fired, { t1: until });
    expect(again.map((reminder) => reminder.key)).toEqual([
      `anchor:t1:${at10}:snooze:${until}`,
    ]);
    expect(
      due([entry()], until + minute, [...fired, again[0].key], { t1: until }),
    ).toEqual([]);
  });

  it("ignores a snooze older than the anchor", () => {
    expect(
      due([entry()], tenOClock, [], { t1: tenOClock - 60 * minute }).map(
        (reminder) => reminder.key,
      ),
    ).toEqual([`anchor:t1:${at10}`]);
  });

  it("orders several by time", () => {
    const at950 = "2026-10-02T07:50:00.000Z";
    expect(
      due([entry(), entry({ id: "t0", startsAt: at950 })], tenOClock).map(
        (reminder) => reminder.entry.id,
      ),
    ).toEqual(["t0", "t1"]);
  });
});
