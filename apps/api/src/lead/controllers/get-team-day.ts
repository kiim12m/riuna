import {
  getWorkspaceColumns,
  LEGACY_FINAL_STATUS,
} from "../../my-work/decorate";
import { loggedSecondsByTask } from "../../planner/queries";
import { loadBlocksByDayForUsers } from "../../schedule/blocks-by-day";
import {
  endOfServerDay,
  serverDayKey,
  startOfServerDay,
} from "../../utils/day-boundaries";
import { capacityForDay } from "../../work-schedule/day-capacity";
import { dayLoad } from "../../work-schedule/day-load";
import { getWorkSchedules } from "../../work-schedule/get-work-schedule";
import { loadUnavailableDaysForUsers } from "../../work-schedule/unavailable-days";
import {
  loadCloses,
  loadDone,
  loadPeople,
  loadPlanned,
  loadWorked,
} from "../team-data";
import { visibleMemberIds } from "../visibility";

/**
 * El dia de la gente de un responsable (5.3, ADR 059): por persona, el plan
 * -imprescindibles delante-, la capacidad con ausencias y festivos, la carga,
 * lo terminado, lo registrado y el cierre **publico**. Todo en lote: unas
 * nueve consultas para el equipo entero, sin importar cuanta gente sea.
 */
export default async function getTeamDay({
  workspaceId,
  leadUserId,
  day,
  now = new Date(),
}: {
  workspaceId: string;
  leadUserId: string;
  day: Date;
  now?: Date;
}) {
  const start = startOfServerDay(day);
  const end = endOfServerDay(day);
  const dayKey = serverDayKey(day);
  const ids = await visibleMemberIds({ workspaceId, leadUserId });
  if (ids.length === 0) return { day: dayKey, members: [] };

  const [
    people,
    projectColumns,
    schedules,
    planned,
    done,
    worked,
    blocks,
    unavailable,
    closes,
  ] = await Promise.all([
    loadPeople(ids),
    getWorkspaceColumns(workspaceId),
    getWorkSchedules(ids),
    loadPlanned(workspaceId, ids, start, end),
    loadDone(workspaceId, ids, start, end),
    loadWorked(workspaceId, ids, start, end, now),
    loadBlocksByDayForUsers(workspaceId, ids, start, end),
    loadUnavailableDaysForUsers({ workspaceId, userIds: ids, start, end }),
    loadCloses(workspaceId, ids, [start]),
  ]);
  const logged = await loggedSecondsByTask([
    ...new Set(planned.map((entry) => entry.id)),
  ]);

  const members = people.map((person) => {
    const dayBlocks = blocks.get(person.id)?.blocksByDay.get(dayKey) ?? [];
    const off = unavailable.get(person.id)?.get(dayKey) ?? null;
    const schedule = schedules.get(person.id);
    const capacitySeconds = schedule
      ? capacityForDay(schedule, start, dayBlocks, off !== null)
      : 0;

    const entries = planned
      .filter((entry) => entry.userId === person.id)
      .map((entry) => ({
        id: entry.id,
        number: entry.number,
        title: entry.title,
        projectSlug: entry.projectSlug,
        startMinute: entry.startMinute,
        keyRank: entry.keyRank,
        estimate: entry.estimate,
        loggedSeconds: logged.get(entry.id) ?? 0,
        isDone:
          projectColumns.get(entry.projectId)?.finals.includes(entry.status) ??
          entry.status === LEGACY_FINAL_STATUS,
      }))
      // Las imprescindibles delante (ADR 053); `sort` es estable.
      .sort((a, b) => (a.keyRank ?? 4) - (b.keyRank ?? 4));

    const close = closes.find((row) => row.userId === person.id);

    return {
      ...person,
      unavailable: off,
      load: dayLoad({
        entries,
        fixedBlocks: dayBlocks.filter((block) => block.kind === "fixed"),
        capacitySeconds,
      }),
      planned: entries,
      done: done
        .filter(
          (task) =>
            task.userId === person.id &&
            // Planificada por el ese dia, o asignada: como «Hechas» de Hoy.
            (!task.viaPlan ||
              (task.plannedDate !== null &&
                serverDayKey(task.plannedDate) === dayKey)),
        )
        .map(({ id, number, title, projectSlug }) => ({
          id,
          number,
          title,
          projectSlug,
        })),
      workedSeconds: worked.get(person.id) ?? 0,
      close: close
        ? { blockers: close.blockers, summary: close.summary }
        : null,
    };
  });

  return { day: dayKey, members };
}
