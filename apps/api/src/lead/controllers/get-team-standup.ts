import {
  getWorkspaceColumns,
  LEGACY_FINAL_STATUS,
} from "../../my-work/decorate";
import { previousWorkDay } from "../../review/standup";
import {
  endOfServerDay,
  serverDayKey,
  startOfServerDay,
} from "../../utils/day-boundaries";
import { getWorkSchedules } from "../../work-schedule/get-work-schedule";
import { loadCloses, loadDone, loadPeople, loadPlanned } from "../team-data";
import { visibleMemberIds } from "../visibility";

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
 * El stand-up de la gente de un responsable (5.3, ADR 059): el mismo que cada
 * persona ve en Hoy (2.4) -ayer lo terminado, hoy el plan con las
 * imprescindibles delante, y los bloqueos del cierre mas reciente-, pero en
 * lote: cada «ayer» sale de la jornada de cada uno, y una consulta por cosa
 * cubre a todos.
 */
export default async function getTeamStandup({
  workspaceId,
  leadUserId,
  now = new Date(),
}: {
  workspaceId: string;
  leadUserId: string;
  now?: Date;
}) {
  const today = startOfServerDay(now);
  const ids = await visibleMemberIds({ workspaceId, leadUserId });
  if (ids.length === 0) return { members: [] };

  const schedules = await getWorkSchedules(ids);
  const yesterdayOf = new Map(
    ids.map((id) => {
      const schedule = schedules.get(id);
      return [id, schedule ? previousWorkDay(today, schedule) : today];
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

  const [people, projectColumns, planned, done, closes] = await Promise.all([
    loadPeople(ids),
    getWorkspaceColumns(workspaceId),
    loadPlanned(workspaceId, ids, today, endOfServerDay(today)),
    loadDone(workspaceId, ids, earliest, endOfServerDay(latest)),
    loadCloses(workspaceId, ids, closeDays),
  ]);

  const members = people.map((person) => {
    const yesterday = yesterdayOf.get(person.id) ?? today;
    const yesterdayKey = serverDayKey(yesterday);
    const mine = closes
      .filter((close) => close.userId === person.id)
      .sort((a, b) => b.periodStart.getTime() - a.periodStart.getTime());

    return {
      ...person,
      standup: {
        yesterday: {
          day: yesterdayKey,
          done: done
            .filter(
              (task) =>
                task.userId === person.id &&
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
                entry.userId === person.id &&
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
      },
    };
  });

  return { members };
}
