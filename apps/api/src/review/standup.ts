import { and, desc, eq, inArray } from "drizzle-orm";
import db from "../database";
import { reviewTable } from "../database/schema";
import getToday from "../today/controllers/get-today";
import {
  addDays,
  endOfServerDay,
  serverDayKey,
  startOfServerDay,
} from "../utils/day-boundaries";
import { isWorkDay } from "../work-schedule/day-capacity";
import { getWorkSchedule } from "../work-schedule/get-work-schedule";
import { loadUnavailableDays } from "../work-schedule/unavailable-days";

type StandupTask = {
  id: string;
  number: number | null;
  title: string;
  projectSlug: string;
  keyRank: number | null;
};

/**
 * Hasta donde se mira atras buscando «ayer»: cubre unas vacaciones largas.
 * Mas alla, el dia anterior.
 */
export const STANDUP_LOOKBACK_DAYS = 31;

/**
 * El ultimo dia laborable antes de `day` segun la jornada personal
 * (ADR 045), saltando festivos y ausencias (`unavailable`, por
 * `yyyy-mm-dd`, ADR 060): un lunes, el viernes; tras un lunes festivo, el
 * viernes tambien. Sin ninguno, el dia anterior.
 */
export function previousWorkDay(
  day: Date,
  schedule: Awaited<ReturnType<typeof getWorkSchedule>>,
  unavailable: ReadonlySet<string> = new Set(),
) {
  for (let back = 1; back <= STANDUP_LOOKBACK_DAYS; back++) {
    const candidate = addDays(day, -back);
    if (
      isWorkDay(schedule, candidate) &&
      !unavailable.has(serverDayKey(candidate))
    ) {
      return candidate;
    }
  }
  return addDays(day, -1);
}

function midday(day: Date) {
  const value = new Date(day);
  value.setHours(12, 0, 0, 0);
  return value;
}

/**
 * El stand-up de una persona (sub-bloque 2.4): derivado, sin guardar. Ayer
 * -el ultimo dia laborable- lo terminado; hoy, el plan con las
 * imprescindibles delante; y los bloqueos del cierre mas reciente.
 *
 * **Solo lee la parte visible de los cierres**, nunca la valoracion: el
 * responsable de departamento vera esto mismo para su gente (5.3), y la
 * prueba de arquitectura de la ADR 054 falla si este fichero nombra la
 * tabla privada.
 */
export async function getStandup({
  workspaceId,
  userId,
  now = new Date(),
}: {
  workspaceId: string;
  userId: string;
  now?: Date;
}) {
  const today = startOfServerDay(now);
  const [schedule, unavailable] = await Promise.all([
    getWorkSchedule(userId),
    loadUnavailableDays({
      workspaceId,
      userId,
      start: addDays(today, -STANDUP_LOOKBACK_DAYS),
      end: endOfServerDay(addDays(today, -1)),
    }),
  ]);
  const yesterday = previousWorkDay(
    today,
    schedule,
    new Set(unavailable.keys()),
  );

  const [todayView, yesterdayView, closes] = await Promise.all([
    getToday({ workspaceId, userId, now }),
    getToday({ workspaceId, userId, now: midday(yesterday) }),
    db
      .select({
        periodStart: reviewTable.periodStart,
        blockers: reviewTable.blockers,
      })
      .from(reviewTable)
      .where(
        and(
          eq(reviewTable.userId, userId),
          eq(reviewTable.workspaceId, workspaceId),
          eq(reviewTable.period, "day"),
          inArray(reviewTable.periodStart, [today, yesterday]),
        ),
      )
      .orderBy(desc(reviewTable.periodStart)),
  ]);

  const toTask = (task: {
    id: string;
    number: number | null;
    title: string;
    projectSlug: string;
    keyRank?: number | null;
  }): StandupTask => ({
    id: task.id,
    number: task.number,
    title: task.title,
    projectSlug: task.projectSlug,
    keyRank: task.keyRank ?? null,
  });

  return {
    yesterday: {
      day: serverDayKey(yesterday),
      done: yesterdayView.done.map(toTask),
      closed: closes.some(
        (close) => close.periodStart.getTime() === yesterday.getTime(),
      ),
    },
    today: {
      day: serverDayKey(today),
      // `GET /today` ya las da con las imprescindibles delante (ADR 053).
      planned: todayView.planned.map(toTask),
    },
    blockers: closes.find((close) => close.blockers)?.blockers ?? null,
  };
}
