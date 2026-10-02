import { and, asc, between, eq } from "drizzle-orm";
import db from "../../database";
import {
  personalPlanEntryTable,
  projectTable,
  taskTable,
  teamTable,
} from "../../database/schema";
import { decorateTasks, getWorkspaceColumns } from "../../my-work/decorate";
import { computeGhosts } from "../../planner/ghosts";
import { loggedSecondsByTask } from "../../planner/queries";
import { getRunningEntry } from "../../time-entry/running";
import {
  dayKeysBetween,
  parseServerDay,
  serverDayKey,
} from "../../utils/day-boundaries";
import { capacityForDay } from "../../work-schedule/day-capacity";
import { dayLoad } from "../../work-schedule/day-load";
import { getWorkSchedule } from "../../work-schedule/get-work-schedule";
import { loadBlocksByDay } from "../blocks-by-day";
import { buildDay } from "../build-day";
import {
  MIN_ENTRY_DURATION_SECONDS,
  UNESTIMATED_ENTRY_SECONDS,
} from "../constants";

const taskColumns = {
  id: taskTable.id,
  number: taskTable.number,
  title: taskTable.title,
  status: taskTable.status,
  priority: taskTable.priority,
  estimate: taskTable.estimate,
  projectId: taskTable.projectId,
  projectName: projectTable.name,
  projectSlug: projectTable.slug,
  projectIcon: projectTable.icon,
  teamId: taskTable.teamId,
  teamName: teamTable.name,
};

export default async function getSchedule({
  workspaceId,
  userId,
  windowStart,
  windowEnd,
  now = new Date(),
}: {
  workspaceId: string;
  userId: string;
  windowStart: Date;
  windowEnd: Date;
  now?: Date;
}) {
  const todayKey = serverDayKey(now);

  const [
    projectColumns,
    schedule,
    entryRows,
    { blocksByDay, blocksById },
    runningEntry,
    ghosts,
  ] = await Promise.all([
    getWorkspaceColumns(workspaceId),
    getWorkSchedule(userId),
    db
      .select({
        ...taskColumns,
        plannedDate: personalPlanEntryTable.plannedDate,
        position: personalPlanEntryTable.position,
        startMinute: personalPlanEntryTable.startMinute,
      })
      .from(personalPlanEntryTable)
      .innerJoin(taskTable, eq(personalPlanEntryTable.taskId, taskTable.id))
      .innerJoin(projectTable, eq(taskTable.projectId, projectTable.id))
      .leftJoin(teamTable, eq(taskTable.teamId, teamTable.id))
      .where(
        and(
          eq(personalPlanEntryTable.userId, userId),
          // Sin esto, una entrada planeada desde otro espacio del mismo
          // usuario se colaba aqui: los bloques ya filtraban por
          // workspaceId, esta consulta no.
          eq(personalPlanEntryTable.workspaceId, workspaceId),
          between(personalPlanEntryTable.plannedDate, windowStart, windowEnd),
        ),
      )
      .orderBy(
        asc(personalPlanEntryTable.plannedDate),
        asc(personalPlanEntryTable.position),
      ),
    loadBlocksByDay(workspaceId, userId, windowStart, windowEnd),
    // La entrada en marcha, si hay alguna (ADR 044): comparte consulta con
    // el pie de la barra lateral, en vez de mantener aqui su propia copia.
    getRunningEntry(userId),
    computeGhosts(workspaceId, userId, windowStart, windowEnd),
  ]);

  const decoratedEntries = await decorateTasks(entryRows, projectColumns);

  const entriesByDay = new Map<string, typeof decoratedEntries>();
  for (const entry of decoratedEntries) {
    const key = serverDayKey(entry.plannedDate);
    const list = entriesByDay.get(key) ?? [];
    list.push(entry);
    entriesByDay.set(key, list);
  }

  const ghostsByDay = new Map<string, typeof ghosts>();
  for (const ghost of ghosts) {
    const key = serverDayKey(ghost.plannedDate);
    const list = ghostsByDay.get(key) ?? [];
    list.push(ghost);
    ghostsByDay.set(key, list);
  }

  const taskById = new Map(decoratedEntries.map((entry) => [entry.id, entry]));

  const lunchInterval =
    schedule.lunchEnabled &&
    schedule.lunchStartMinute != null &&
    schedule.lunchEndMinute != null
      ? {
          startMinute: schedule.lunchStartMinute,
          endMinute: schedule.lunchEndMinute,
        }
      : null;

  const loggedByTask = await loggedSecondsByTask(
    decoratedEntries.map((entry) => entry.id),
  );

  const days = dayKeysBetween(windowStart, windowEnd).map((dayKey) => {
    const dayBlocks = blocksByDay.get(dayKey) ?? [];
    return {
      ...buildDay(dayKey, {
        entriesByDay,
        blocksByDay,
        ghostsByDay,
        taskById,
        blockById: blocksById,
        runningEntry,
        now,
        todayKey,
        workStartMinute: schedule.workStartMinute,
        workEndMinute: schedule.workEndMinute,
        lunchInterval,
      }),
      // La misma carga que el Planificador (ADR 050), no la suma de los
      // tramos -que lleva el relleno de lo no estimado- frente a la jornada
      // bruta.
      load: dayLoad({
        entries: (entriesByDay.get(dayKey) ?? []).map((entry) => ({
          estimate: entry.estimate,
          loggedSeconds: loggedByTask.get(entry.id) ?? 0,
          isDone: entry.isDone,
        })),
        fixedBlocks: dayBlocks.filter((block) => block.kind === "fixed"),
        capacitySeconds: capacityForDay(
          schedule,
          parseServerDay(dayKey, "day"),
          dayBlocks,
        ),
      }),
    };
  });

  return {
    days,
    workStartMinute: schedule.workStartMinute,
    workEndMinute: schedule.workEndMinute,
    // Mismo patron que `get-plan.ts`: el cliente deja de calcular "hoy" con
    // el reloj del navegador para resaltar la columna/celda correcta.
    serverToday: todayKey,
    // Idem para los minimos de duracion: antes la web tenia su propia copia
    // muda de estas dos constantes (`schedule-timeline.ts`), sin nada que
    // impidiera que se desincronizaran de las de aqui.
    minEntrySeconds: MIN_ENTRY_DURATION_SECONDS,
    unestimatedEntrySeconds: UNESTIMATED_ENTRY_SECONDS,
  };
}
