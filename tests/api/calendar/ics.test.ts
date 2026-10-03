import { describe, expect, it } from "vitest";
import { blockEvents } from "../../../apps/api/src/calendar/feed-events";
import {
  cadenceRrule,
  escapeText,
  foldLine,
  writeCalendar,
} from "../../../apps/api/src/calendar/ics-writer";
import type {
  ScheduleBlockRow as Block,
  BlocksByDay,
} from "../../../apps/api/src/schedule/blocks-by-day";

const encoder = new TextEncoder();
const now = new Date("2026-10-02T10:00:00.000Z");

function block(overrides: Partial<Block> = {}): Block {
  return {
    id: "b1",
    workspaceId: "w1",
    userId: "u1",
    title: "Visita de obra",
    kind: "fixed",
    plannedDate: null,
    cadence: null,
    endsAt: null,
    startMinute: 9 * 60,
    endMinute: 10 * 60,
    createdAt: new Date(2026, 8, 30, 12),
    updatedAt: new Date(2026, 8, 30, 12),
    ...overrides,
  };
}

function blocks(
  rows: Block[],
  days: Record<string, string[]> = {},
): BlocksByDay {
  const blocksById = new Map(rows.map((row) => [row.id, row]));
  const blocksByDay = new Map(
    Object.entries(days).map(([day, ids]) => [
      day,
      ids.map((id) => blocksById.get(id) as Block),
    ]),
  );
  return { blocksByDay, blocksById };
}

/**
 * El escritor ICS del feed del calendario (sub-bloque 4.1 del interludio de
 * productividad, ADR 057), y la decision de escribir un bloque repetido como
 * serie o como ocurrencias.
 */
describe("ics writer", () => {
  it("escapes text values", () => {
    expect(escapeText("Obra; fase 2, sur\\norte\nsegunda línea")).toBe(
      "Obra\\; fase 2\\, sur\\\\norte\\nsegunda línea",
    );
  });

  it("folds long lines at 75 octets without splitting a multi-byte character", () => {
    const line = `SUMMARY:${"Reunión de diseño ☕ ".repeat(8)}`;
    const folded = foldLine(line);
    const parts = folded.split("\r\n");
    expect(parts.length).toBeGreaterThan(1);
    for (const [index, part] of parts.entries()) {
      expect(encoder.encode(part).length).toBeLessThanOrEqual(75);
      if (index > 0) expect(part.startsWith(" ")).toBe(true);
    }
    expect(
      parts.map((part, i) => (i > 0 ? part.slice(1) : part)).join(""),
    ).toBe(line);
    expect(foldLine("SUMMARY:corto")).toBe("SUMMARY:corto");
  });

  it("writes timed events in UTC and all-day events ending the next day, with CRLF", () => {
    const ics = writeCalendar({
      name: "Riuna · Obras",
      now,
      events: [
        {
          kind: "timed",
          uid: "riuna-plan-t1",
          summary: "Llamar al proveedor",
          description: "Compras",
          start: new Date("2026-10-25T09:00:00.000Z"),
          end: new Date("2026-10-25T09:30:00.000Z"),
        },
        {
          kind: "all-day",
          uid: "riuna-due-t2",
          summary: "Vence: Entregar memoria",
          day: "2026-10-31",
        },
      ],
    });
    expect(ics.endsWith("\r\n")).toBe(true);
    expect(ics.split("\r\n")).toEqual(
      expect.arrayContaining([
        "BEGIN:VCALENDAR",
        "X-WR-CALNAME:Riuna · Obras",
        "UID:riuna-plan-t1",
        "DTSTAMP:20261002T100000Z",
        "DTSTART:20261025T090000Z",
        "DTEND:20261025T093000Z",
        "DESCRIPTION:Compras",
        "DTSTART;VALUE=DATE:20261031",
        "DTEND;VALUE=DATE:20261101",
        "END:VCALENDAR",
      ]),
    );
    // Sin series no hace falta la zona.
    expect(ics).not.toContain("VTIMEZONE");
    expect(ics.replaceAll("\r\n", "")).not.toContain("\n");
  });

  it("writes a cadence as an RRULE only when it means the same", () => {
    expect(cadenceRrule({ frequency: "daily", interval: 1 }, null)).toBe(
      "FREQ=DAILY",
    );
    expect(
      cadenceRrule(
        { frequency: "weekly", interval: 1, byWeekday: [1, 3, 5] },
        new Date("2026-11-30T22:59:59.999Z"),
      ),
    ).toBe("FREQ=WEEKLY;BYDAY=MO,WE,FR;UNTIL=20261130T225959Z");
    expect(
      cadenceRrule({ frequency: "monthly", interval: 1, byMonthDay: 15 }, null),
    ).toBe("FREQ=MONTHLY;BYMONTHDAY=15");
    // "El 31" se recorta en los meses cortos; BYMONTHDAY se los saltaria.
    expect(
      cadenceRrule({ frequency: "monthly", interval: 1, byMonthDay: 31 }, null),
    ).toBeNull();
    expect(
      cadenceRrule({ frequency: "weekly", interval: 2, byWeekday: [1] }, null),
    ).toBeNull();
  });
});

describe("blockEvents", () => {
  it("writes a weekly block as one series from the day it was created, in Madrid wall time", () => {
    const weekly = block({
      cadence: { frequency: "weekly", interval: 1, byWeekday: [1, 3] },
      endsAt: new Date(2026, 10, 30),
    });
    const events = blockEvents(
      blocks([weekly], { "2026-10-05": ["b1"], "2026-10-07": ["b1"] }),
      { series: true },
    );
    expect(events).toEqual([
      {
        kind: "series",
        uid: "riuna-block-b1",
        summary: "Visita de obra",
        // Creado el miercoles 30 de septiembre, que ya es dia de la serie.
        start: { year: 2026, month: 9, day: 30, hour: 9, minute: 0 },
        end: { year: 2026, month: 9, day: 30, hour: 10, minute: 0 },
        // El ultimo instante del 30 de noviembre en Madrid (CET, +1).
        rrule: "FREQ=WEEKLY;BYDAY=MO,WE;UNTIL=20261130T225959Z",
      },
    ]);

    const ics = writeCalendar({ name: "Riuna", events, now });
    expect(ics).toContain("BEGIN:VTIMEZONE\r\nTZID:Europe/Madrid");
    expect(ics).toContain("DTSTART;TZID=Europe/Madrid:20260930T090000");
    expect(ics).toContain("DTEND;TZID=Europe/Madrid:20260930T100000");
  });

  it("writes occurrences one by one when the cadence is not an RRULE or series are off", () => {
    const monthly = block({
      cadence: { frequency: "monthly", interval: 1, byMonthDay: 31 },
    });
    const days = { "2026-10-31": ["b1"], "2026-11-30": ["b1"] };
    const expected = [
      {
        kind: "timed",
        uid: "riuna-block-b1-2026-10-31",
        summary: "Visita de obra",
        start: new Date(2026, 9, 31, 9),
        end: new Date(2026, 9, 31, 10),
      },
      {
        kind: "timed",
        uid: "riuna-block-b1-2026-11-30",
        summary: "Visita de obra",
        start: new Date(2026, 10, 30, 9),
        end: new Date(2026, 10, 30, 10),
      },
    ];
    expect(blockEvents(blocks([monthly], days), { series: true })).toEqual(
      expected,
    );

    const weekly = block({
      cadence: { frequency: "weekly", interval: 1, byWeekday: [6] },
    });
    expect(
      blockEvents(blocks([weekly], { "2026-10-31": ["b1"] }), {
        series: false,
      }).map((event) => event.uid),
    ).toEqual(["riuna-block-b1-2026-10-31"]);
  });

  it("writes a single block at its wall-clock hour, also on the day the clocks change", () => {
    const single = block({
      plannedDate: new Date(2026, 9, 25),
      startMinute: 10 * 60,
      endMinute: 24 * 60,
    });
    const [event] = blockEvents(blocks([single], { "2026-10-25": ["b1"] }), {
      series: true,
    });
    expect(event).toMatchObject({
      kind: "timed",
      uid: "riuna-block-b1",
      // 10:00 en Madrid ese dia ya es CET: las 09:00 UTC.
      start: new Date("2026-10-25T09:00:00.000Z"),
      // Hasta medianoche: el 26 a las 00:00.
      end: new Date(2026, 9, 26),
    });
  });

  it("skips a series that ended before it began and a corrupt cadence", () => {
    const ended = block({
      cadence: { frequency: "daily", interval: 1 },
      endsAt: new Date(2026, 8, 1),
    });
    const corrupt = block({ id: "b2", cadence: { frequency: "yearly" } });
    expect(blockEvents(blocks([ended, corrupt]), { series: true })).toEqual([]);
  });
});
