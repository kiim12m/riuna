import type { Cadence } from "../recurrence/cadence";

/**
 * Un escritor de iCalendar (RFC 5545) a la medida de lo que exporta Riuna
 * (ADR 057): eventos con hora en UTC, dias enteros y series con su zona. Sin
 * dependencias: escribir esto es poco. Lo dificil es leer el iCal de otros,
 * y eso es el 4.2, aplazado.
 */

export const ICS_TIME_ZONE = "Europe/Madrid";

/**
 * Las reglas de Europa/Madrid desde 1996: el ultimo domingo de marzo a las
 * 02:00 pasa a CEST y el ultimo de octubre a las 03:00 vuelve a CET. Google y
 * Apple conocen la zona por su nombre; Outlook necesita la definicion.
 */
const MADRID_VTIMEZONE = [
  "BEGIN:VTIMEZONE",
  `TZID:${ICS_TIME_ZONE}`,
  "BEGIN:DAYLIGHT",
  "TZOFFSETFROM:+0100",
  "TZOFFSETTO:+0200",
  "TZNAME:CEST",
  "DTSTART:19700329T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
  "END:DAYLIGHT",
  "BEGIN:STANDARD",
  "TZOFFSETFROM:+0200",
  "TZOFFSETTO:+0100",
  "TZNAME:CET",
  "DTSTART:19701025T030000",
  "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
  "END:STANDARD",
  "END:VTIMEZONE",
];

/** Una hora de pared, sin zona: la de la serie la pone `TZID`. */
export type LocalDateTime = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

type EventBase = { uid: string; summary: string; description?: string };

export type IcsEvent =
  | (EventBase & { kind: "timed"; start: Date; end: Date })
  /** `day` es `yyyy-mm-dd`. */
  | (EventBase & { kind: "all-day"; day: string })
  | (EventBase & {
      kind: "series";
      start: LocalDateTime;
      end: LocalDateTime;
      rrule: string;
    });

const pad = (value: number, length = 2) => String(value).padStart(length, "0");

export function utcStamp(date: Date): string {
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  );
}

function localStamp(value: LocalDateTime): string {
  return `${value.year}${pad(value.month)}${pad(value.day)}T${pad(value.hour)}${pad(value.minute)}00`;
}

function dateValue(day: string): string {
  return day.replaceAll("-", "");
}

function nextDayValue(day: string): string {
  const [year = 0, month = 1, date = 1] = day.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, date + 1));
  return `${next.getUTCFullYear()}${pad(next.getUTCMonth() + 1)}${pad(next.getUTCDate())}`;
}

export function escapeText(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll(";", "\\;")
    .replaceAll(",", "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

const encoder = new TextEncoder();

/**
 * Parte una linea en trozos de 75 octetos como mucho, con la continuacion
 * empezando por un espacio. Corta por octetos sin partir nunca un caracter
 * de varios bytes: un titulo con tildes o emojis no se corrompe.
 */
export function foldLine(line: string): string {
  if (encoder.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let current = "";
  let size = 0;
  let limit = 75;
  for (const char of line) {
    const bytes = encoder.encode(char).length;
    if (size + bytes > limit) {
      parts.push(current);
      current = "";
      size = 0;
      // El espacio de la continuacion cuenta.
      limit = 74;
    }
    current += char;
    size += bytes;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

const WEEKDAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

/**
 * La `RRULE` de una cadencia, o `null` si no se puede escribir igual:
 * - un intervalo mayor que 1 no tiene ancla propia en Riuna (ADR 041);
 * - y "el dia 31" se recorta al ultimo dia de los meses mas cortos, cosa que
 *   `BYMONTHDAY` no hace: se los salta.
 *
 * `until` es el ultimo instante que puede empezar una ocurrencia.
 */
export function cadenceRrule(
  cadence: Cadence,
  until: Date | null,
): string | null {
  if (cadence.interval !== 1) return null;
  let rule: string;
  if (cadence.frequency === "daily") {
    rule = "FREQ=DAILY";
  } else if (cadence.frequency === "weekly") {
    rule = `FREQ=WEEKLY;BYDAY=${cadence.byWeekday.map((day) => WEEKDAYS[day]).join(",")}`;
  } else {
    if (cadence.byMonthDay > 28) return null;
    rule = `FREQ=MONTHLY;BYMONTHDAY=${cadence.byMonthDay}`;
  }
  return until ? `${rule};UNTIL=${utcStamp(until)}` : rule;
}

function eventLines(event: IcsEvent, stamp: string): string[] {
  const lines = ["BEGIN:VEVENT", `UID:${event.uid}`, `DTSTAMP:${stamp}`];
  if (event.kind === "timed") {
    lines.push(
      `DTSTART:${utcStamp(event.start)}`,
      `DTEND:${utcStamp(event.end)}`,
    );
  } else if (event.kind === "all-day") {
    lines.push(
      `DTSTART;VALUE=DATE:${dateValue(event.day)}`,
      `DTEND;VALUE=DATE:${nextDayValue(event.day)}`,
    );
  } else {
    lines.push(
      `DTSTART;TZID=${ICS_TIME_ZONE}:${localStamp(event.start)}`,
      `DTEND;TZID=${ICS_TIME_ZONE}:${localStamp(event.end)}`,
      `RRULE:${event.rrule}`,
    );
  }
  lines.push(`SUMMARY:${escapeText(event.summary)}`);
  if (event.description) {
    lines.push(`DESCRIPTION:${escapeText(event.description)}`);
  }
  lines.push("END:VEVENT");
  return lines;
}

export function writeCalendar({
  name,
  events,
  now,
}: {
  name: string;
  events: IcsEvent[];
  now: Date;
}): string {
  const stamp = utcStamp(now);
  const hasSeries = events.some((event) => event.kind === "series");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Riuna//Calendario//ES",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(name)}`,
    ...(hasSeries
      ? [`X-WR-TIMEZONE:${ICS_TIME_ZONE}`, ...MADRID_VTIMEZONE]
      : []),
    // Una pista para quien la respete: Google la ignora y pide cuando quiere.
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
    ...events.flatMap((event) => eventLines(event, stamp)),
    "END:VCALENDAR",
  ];
  return `${lines.map(foldLine).join("\r\n")}\r\n`;
}
