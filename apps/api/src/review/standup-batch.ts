import { loadCloses, loadDone, loadPlanned } from "../lead/team-data";
import { getWorkspaceColumns, LEGACY_FINAL_STATUS } from "../my-work/decorate";
import {
  addDays,
  endOfServerDay,
  serverDayKey,
  startOfServerDay,
} from "../utils/day-boundaries";
import { getWorkSchedules } from "../work-schedule/get-work-schedule";
import { loadUnavailableDaysForUsers } from "../work-schedule/unavailable-days";
import { previousWorkDay, STANDUP_LOOKBACK_DAYS } from "./previous-work-day";

const toTask = (task: {
  id: string;
  number: number | null;
  title: string;
  projectSlug: string;
  keyRank?: number | null;
}) => ({
  id: task.id,
  number: task.number,
  title: task.title,
  projectSlug: task.projectSlug,
  keyRank: task.keyRank ?? null,
});

/**
 * Los stand-ups de varias personas (ADR 059), en lote: ayer lo terminado —el
 * ultimo dia laborable de la jornada de cada una—, hoy el plan con las
 * imprescindibles delante, y los bloqueos del cierre mas reciente. Una consulta
 * por cosa cubre a todas, sea cual sea el numero.
 *
 * **Es la unica implementacion**: el stand-up propio (`getStandup`) es esto con
 * una sola persona, y el del responsable, con su gente. Asi no pueden
 * diferenciarse. Nunca lee la valoracion privada (ADR 054): la prueba de
 * arquitectura falla si este fichero nombra su tabla.
 */
export async function loadStandups({
  workspaceId,
  userIds,
  now = new Date(),
}: {
  workspaceId: string;
  userIds: string[];
  now?: Date;
}) {
  const today = startOfServerDay(now);
  const ids = userIds;
  const standups = new Map<string, Standup>();
  if (ids.length === 0) return standups;

  const [schedules, unavailable] = await Promise.all([
    getWorkSchedules(ids),
    loadUnavailableDaysForUsers({
      workspaceId,
      userIds: ids,
      start: addDays(today, -STANDUP_LOOKBACK_DAYS),
      end: endOfServerDay(addDays(today, -1)),
    }),
  ]);
  const yesterdayOf = new Map(
    ids.map((id) => {
      const schedule = schedules.get(id);
      const daysOff = new Set(unavailable.get(id)?.keys() ?? []);
      return [id, schedule ? previousWorkDay(today, schedule, daysOff) : today];
    }),
  );
  const yesterdays = [...yesterdayOf.values()];
  const earliest = new Date(
    Math.min(...yesterdays.map((day) => day.getTime())),
  );
  const latest = new Date(Math.max(...yesterdays.map((day) => day.getTime())));
  const closeDays = [
    today,
    ...new Map(yesterdays.map((day) => [day.getTime(), day])).values(),
  ];

  const [projectColumns, planned, done, closes] = await Promise.all([
    getWorkspaceColumns(workspaceId),
    loadPlanned(workspaceId, ids, today, endOfServerDay(today)),
    loadDone(workspaceId, ids, earliest, endOfServerDay(latest)),
    loadCloses(workspaceId, ids, closeDays),
  ]);

  for (const id of ids) {
    const yesterday = yesterdayOf.get(id) ?? today;
    const yesterdayKey = serverDayKey(yesterday);
    const mine = closes
      .filter((close) => close.userId === id)
      .sort((a, b) => b.periodStart.getTime() - a.periodStart.getTime());

    standups.set(id, {
      yesterday: {
        day: yesterdayKey,
        done: done
          .filter(
            (task) =>
              task.userId === id &&
              serverDayKey(task.completedAt) === yesterdayKey &&
              (!task.viaPlan ||
                (task.plannedDate !== null &&
                  serverDayKey(task.plannedDate) === yesterdayKey)),
          )
          .map(toTask),
        closed: mine.some(
          (close) => close.periodStart.getTime() === yesterday.getTime(),
        ),
      },
      today: {
        day: serverDayKey(today),
        planned: planned
          .filter(
            (entry) =>
              entry.userId === id &&
              !(
                projectColumns
                  .get(entry.projectId)
                  ?.finals.includes(entry.status) ??
                entry.status === LEGACY_FINAL_STATUS
              ),
          )
          .sort((a, b) => (a.keyRank ?? 4) - (b.keyRank ?? 4))
          .map(toTask),
      },
      blockers: mine.find((close) => close.blockers)?.blockers ?? null,
    });
  }

  return standups;
}

export type Standup = {
  yesterday: {
    day: string;
    done: ReturnType<typeof toTask>[];
    closed: boolean;
  };
  today: { day: string; planned: ReturnType<typeof toTask>[] };
  blockers: string | null;
};
