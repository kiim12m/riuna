import {
  addDays as addDaysFns,
  addMonths,
  addWeeks,
  endOfWeek,
  getISOWeek,
  startOfWeek,
} from "date-fns";
import {
  buildMonthWeeks,
  type WeekStartsOn,
} from "@/components/calendar/month-grid-model";
import { formatDate } from "@/lib/format";

export type ScheduleView = "day" | "week" | "month";

export type ScheduleRange = {
  /** Primer dia de la ventana que hay que pedir a la API (`from`). */
  from: Date;
  /** Cuantos dias pedir a partir de `from`. */
  days: number;
  /** Cada dia visible, como clave `yyyy-mm-dd`, en el orden de la rejilla. */
  dayKeys: string[];
  /** Solo para la vista Mes: las mismas claves agrupadas por fila de semana. */
  weeks?: string[][];
};

/**
 * Un dia como `yyyy-mm-dd` **local**, nunca `toISOString()`: coincide con
 * `serverDayKey` (`apps/api/src/utils/day-boundaries.ts`) y con la clave que
 * ya usa `planner.tsx` (`isoDay`), que este modulo sustituye para el
 * Cronograma.
 */
export function dayKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseDayKey(key: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

/**
 * El rango de dias que una vista necesita, alineado a como cada una navega:
 * un dia suelto, una semana natural completa (segun `weekStartsOn`), o la
 * rejilla de semanas completas que cubre el mes de `anchor` — la misma forma
 * que ya usa el calendario del proyecto (`buildMonthWeeks`).
 */
export function rangeFor(
  view: ScheduleView,
  anchor: Date,
  weekStartsOn: WeekStartsOn,
): ScheduleRange {
  if (view === "day") {
    return { from: anchor, days: 1, dayKeys: [dayKey(anchor)] };
  }

  if (view === "week") {
    const from = startOfWeek(anchor, { weekStartsOn });
    const dayKeys = Array.from({ length: 7 }, (_, index) =>
      dayKey(addDaysFns(from, index)),
    );
    return { from, days: 7, dayKeys };
  }

  const weeks = buildMonthWeeks(anchor, weekStartsOn).map((week) =>
    week.map(dayKey),
  );
  const from = parseDayKey(weeks[0]?.[0] ?? dayKey(anchor));
  const dayKeys = weeks.flat();
  return { from, days: dayKeys.length, dayKeys, weeks };
}

/** Mueve el ancla un paso hacia atras (`direction: -1`) o delante (`+1`). */
export function shiftAnchor(
  view: ScheduleView,
  anchor: Date,
  direction: -1 | 1,
): Date {
  if (view === "day") return addDaysFns(anchor, direction);
  if (view === "week") return addWeeks(anchor, direction);
  return addMonths(anchor, direction);
}

export type HeaderTitle =
  | { view: "day"; label: string }
  | { view: "week"; weekNumber: number; range: string }
  | { view: "month"; label: string };

/**
 * Las partes del titulo de cabecera, ya formateadas con `Intl` para el
 * idioma activo. El texto fijo ("Semana N · …") lo compone el componente con
 * `t("schedule:weekTitle")`, no este modulo — aqui no hay dependencia de
 * i18next, igual que en `schedule-timeline.ts` y `month-grid-model.ts`.
 * `getISOWeek` en vez de contar semanas desde `weekStartsOn`: es el mismo
 * numero de semana que cualquiera reconoce en un calendario, independiente
 * de por donde empiece la suya.
 */
export function headerTitle(
  view: ScheduleView,
  anchor: Date,
  weekStartsOn: WeekStartsOn,
  locale?: string,
): HeaderTitle {
  if (view === "day") {
    return {
      view,
      label: formatDate(
        anchor,
        { weekday: "long", day: "numeric", month: "long" },
        locale,
      ),
    };
  }

  if (view === "week") {
    const from = startOfWeek(anchor, { weekStartsOn });
    const to = endOfWeek(anchor, { weekStartsOn });
    const sameMonth = from.getMonth() === to.getMonth();
    const range = sameMonth
      ? `${formatDate(from, { day: "numeric", month: "short" }, locale)} – ${to.getDate()}`
      : `${formatDate(from, { day: "numeric", month: "short" }, locale)} – ${formatDate(to, { day: "numeric", month: "short" }, locale)}`;
    return { view, weekNumber: getISOWeek(anchor), range };
  }

  return {
    view,
    label: formatDate(anchor, { month: "long", year: "numeric" }, locale),
  };
}
