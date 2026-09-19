import {
  addDays,
  addMonths,
  addQuarters,
  addWeeks,
  differenceInCalendarDays,
  getWeek,
  isSameDay,
  startOfDay,
  startOfMonth,
  startOfQuarter,
  startOfWeek,
  startOfYear,
} from "date-fns";
import { formatDate } from "@/lib/format";

type Translate = (key: string, options?: Record<string, unknown>) => string;

// El Gantt se posiciona por pixeles/dia, no por columnas. El zoom solo cambia
// `pixelsPerDay` y la forma de la cabecera; la matematica de barras, arrastre y
// dependencias es la misma en los cuatro niveles y una barra que empieza a mitad
// de mes no pierde precision al alejar.
export type ZoomLevel = "day" | "week" | "month" | "quarter";

export const ZOOM_LEVELS: ZoomLevel[] = ["day", "week", "month", "quarter"];

const PIXELS_PER_DAY: Record<ZoomLevel, number> = {
  day: 40,
  week: 132 / 7,
  month: 150 / 30.4368,
  quarter: 62 / 30.4368,
};

export function isZoomLevel(value: unknown): value is ZoomLevel {
  return (
    value === "day" ||
    value === "week" ||
    value === "month" ||
    value === "quarter"
  );
}

export type GanttTimeline = {
  rangeStart: Date;
  totalDays: number;
  pixelsPerDay: number;
  trackWidthPx: number;
};

export function buildTimeline(
  rangeStart: Date,
  rangeEnd: Date,
  zoom: ZoomLevel,
): GanttTimeline {
  const totalDays = Math.max(1, differenceInCalendarDays(rangeEnd, rangeStart));
  const pixelsPerDay = PIXELS_PER_DAY[zoom];
  return {
    rangeStart,
    totalDays,
    pixelsPerDay,
    trackWidthPx: totalDays * pixelsPerDay,
  };
}

export function dayOffsetPx(date: Date, timeline: GanttTimeline): number {
  return (
    differenceInCalendarDays(startOfDay(date), timeline.rangeStart) *
    timeline.pixelsPerDay
  );
}

export const MIN_BAR_PX = 8;

// La barra ancla en el **centro** del dia de inicio y del de fin, no en los
// bordes de la columna. Asi apunta al dia al que se refiere y una tarea de un
// solo dia sale como un punto sobre ese dia en vez de como un bloque de 24 h.
export function barMetrics(
  scheduleStart: Date,
  scheduleEnd: Date,
  timeline: GanttTimeline,
): { left: number; width: number } {
  const half = timeline.pixelsPerDay / 2;
  const start = dayOffsetPx(scheduleStart, timeline) + half;
  const end = dayOffsetPx(scheduleEnd, timeline) + half;
  const span = end - start;
  if (span >= MIN_BAR_PX) return { left: start, width: span };
  // Al encoger por debajo del minimo se reparte a los dos lados, para que el
  // punto siga centrado en su dia.
  return { left: start - (MIN_BAR_PX - span) / 2, width: MIN_BAR_PX };
}

// Dos grosores y no mas: la tarea de primer nivel manda, y cualquier subtarea
// —del nivel que sea— adelgaza igual.
const BAR_HEIGHT_ROOT_REM = "0.625rem";
const BAR_HEIGHT_CHILD_REM = "0.375rem";

export function barHeightRem(depth: number): string {
  return depth <= 0 ? BAR_HEIGHT_ROOT_REM : BAR_HEIGHT_CHILD_REM;
}

export type HeaderSegment = {
  key: string;
  label: string;
  sub?: string;
  leftPx: number;
  widthPx: number;
  isCurrent: boolean;
};

export type HeaderBands = {
  top: HeaderSegment[];
  bottom: HeaderSegment[];
  gridlines: { key: string; leftPx: number }[];
};

type WeekStart = 0 | 1 | 2 | 3 | 4 | 5 | 6;

// Dos bandas cuya composicion cambia por zoom, y lineas verticales solo en el
// limite de la unidad mayor (semana en Dia, mes en Semana, etc.).
export function buildHeaderBands(
  timeline: GanttTimeline,
  zoom: ZoomLevel,
  weekStartsOn: WeekStart,
  today: Date,
  t: Translate,
): HeaderBands {
  const { rangeStart, totalDays, pixelsPerDay, trackWidthPx } = timeline;
  const rangeEnd = addDays(rangeStart, totalDays);
  const px = (date: Date) =>
    differenceInCalendarDays(startOfDay(date), rangeStart) * pixelsPerDay;
  const clamp = (value: number) => Math.max(0, Math.min(value, trackWidthPx));

  const spans = (
    first: Date,
    step: (date: Date) => Date,
  ): { start: Date; end: Date }[] => {
    const out: { start: Date; end: Date }[] = [];
    let cursor = first;
    while (cursor < rangeEnd) {
      const next = step(cursor);
      out.push({ start: cursor, end: next });
      cursor = next;
    }
    return out;
  };

  const months = spans(startOfMonth(rangeStart), (d) => addMonths(d, 1));
  const years = spans(startOfYear(rangeStart), (d) => addMonths(d, 12));

  const top: HeaderSegment[] = [];
  const bottom: HeaderSegment[] = [];
  const gridlines: { key: string; leftPx: number }[] = [];

  const bandFor = (
    spanList: { start: Date; end: Date }[],
    options: Intl.DateTimeFormatOptions,
  ) =>
    spanList.map((span) => {
      const left = clamp(px(span.start));
      return {
        key: span.start.toISOString(),
        label: formatDate(span.start, options),
        leftPx: left,
        widthPx: clamp(px(span.end)) - left,
        isCurrent: false,
      };
    });

  if (zoom === "day" || zoom === "week") {
    top.push(...bandFor(months, { month: "short", year: "numeric" }));
  } else {
    top.push(...bandFor(years, { year: "numeric" }));
  }

  if (zoom === "day") {
    for (let i = 0; i < totalDays; i++) {
      const day = addDays(rangeStart, i);
      bottom.push({
        key: day.toISOString(),
        label: String(day.getDate()),
        sub: formatDate(day, { weekday: "narrow" }),
        leftPx: i * pixelsPerDay,
        widthPx: pixelsPerDay,
        isCurrent: isSameDay(day, today),
      });
      if (day.getDay() === weekStartsOn) {
        gridlines.push({ key: `grid-${i}`, leftPx: i * pixelsPerDay });
      }
    }
  } else if (zoom === "week") {
    for (const week of spans(startOfWeek(rangeStart, { weekStartsOn }), (d) =>
      addWeeks(d, 1),
    )) {
      bottom.push({
        key: week.start.toISOString(),
        label: String(getWeek(week.start, { weekStartsOn })),
        leftPx: px(week.start),
        widthPx: 7 * pixelsPerDay,
        isCurrent: today >= week.start && today < week.end,
      });
    }
    for (const month of months) {
      gridlines.push({
        key: `grid-${month.start.toISOString()}`,
        leftPx: px(month.start),
      });
    }
  } else if (zoom === "month") {
    for (const month of months) {
      const left = clamp(px(month.start));
      bottom.push({
        key: month.start.toISOString(),
        label: formatDate(month.start, { month: "short" }),
        leftPx: left,
        widthPx: clamp(px(month.end)) - left,
        isCurrent:
          month.start.getMonth() === today.getMonth() &&
          month.start.getFullYear() === today.getFullYear(),
      });
    }
    for (const quarter of spans(startOfQuarter(rangeStart), (d) =>
      addQuarters(d, 1),
    )) {
      gridlines.push({
        key: `grid-${quarter.start.toISOString()}`,
        leftPx: px(quarter.start),
      });
    }
  } else {
    for (const quarter of spans(startOfQuarter(rangeStart), (d) =>
      addQuarters(d, 1),
    )) {
      const left = clamp(px(quarter.start));
      bottom.push({
        key: quarter.start.toISOString(),
        label: t("tasks:gantt.quarterShort", {
          n: Math.floor(quarter.start.getMonth() / 3) + 1,
        }),
        leftPx: left,
        widthPx: clamp(px(quarter.end)) - left,
        isCurrent: today >= quarter.start && today < quarter.end,
      });
    }
    for (const year of years) {
      gridlines.push({
        key: `grid-${year.start.toISOString()}`,
        leftPx: px(year.start),
      });
    }
  }

  return { top, bottom, gridlines };
}
