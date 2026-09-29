import { and, asc, between, eq, isNull } from "drizzle-orm";
import db from "../../database";
import {
  personalPlanEntryTable,
  projectTable,
  scheduleBlockTable,
  taskTable,
  teamTable,
  timeEntryTable,
} from "../../database/schema";
import { decorateTasks, getWorkspaceColumns } from "../../my-work/decorate";
import { computeGhosts } from "../../planner/ghosts";
import { serverDayKey } from "../../utils/day-boundaries";
import { buildDay, projectRepeatingBlocks } from "../build-day";
import {
  MIN_ENTRY_DURATION_SECONDS,
  UNESTIMATED_ENTRY_SECONDS,
  WORK_END_MINUTE,
  WORK_START_MINUTE,
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

function buildDayKeys(windowStart: Date, windowEnd: Date): string[] {
  const keys: string[] = [];
  const cursor = new Date(windowStart);
  while (cursor <= windowEnd) {
    keys.push(serverDayKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return keys;
}

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
  const projectColumns = await getWorkspaceColumns(workspaceId);
  const todayKey = serverDayKey(now);

  const [entryRows, singleBlocks, repeatingBlocks, runningEntry, ghosts] =
    await Promise.all([
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
      db
        .select()
        .from(scheduleBlockTable)
        .where(
          and(
            eq(scheduleBlockTable.workspaceId, workspaceId),
            eq(scheduleBlockTable.userId, userId),
            between(scheduleBlockTable.plannedDate, windowStart, windowEnd),
          ),
        ),
      db
        .select()
        .from(scheduleBlockTable)
        .where(
          and(
            eq(scheduleBlockTable.workspaceId, workspaceId),
            eq(scheduleBlockTable.userId, userId),
            isNull(scheduleBlockTable.plannedDate),
          ),
        ),
      db
        .select()
        .from(timeEntryTable)
        .where(
          and(
            eq(timeEntryTable.userId, userId),
            isNull(timeEntryTable.endTime),
          ),
        )
        .limit(1),
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

  const blocksByDay = new Map<string, (typeof singleBlocks)[number][]>();
  for (const block of singleBlocks) {
    if (!block.plannedDate) continue;
    const key = serverDayKey(block.plannedDate);
    const list = blocksByDay.get(key) ?? [];
    list.push(block);
    blocksByDay.set(key, list);
  }

  projectRepeatingBlocks(repeatingBlocks, blocksByDay, windowStart, windowEnd);

  const ghostsByDay = new Map<string, typeof ghosts>();
  for (const ghost of ghosts) {
    const key = serverDayKey(ghost.plannedDate);
    const list = ghostsByDay.get(key) ?? [];
    list.push(ghost);
    ghostsByDay.set(key, list);
  }

  const taskById = new Map(decoratedEntries.map((entry) => [entry.id, entry]));
  // Lo que hace falta para prellenar el dialogo de editar un bloque
  // (`create-block-dialog.tsx`): la fila real, no el tramo fusionado y
  // recortado a la ventana que arma `layoutDay` -ese no sabe si es suelto o
  // repetido, ni su horario propio si se fusiono con otro que se solapaba.
  const blockById = new Map(
    [...singleBlocks, ...repeatingBlocks].map((block) => [block.id, block]),
  );

  const days = buildDayKeys(windowStart, windowEnd).map((dayKey) =>
    buildDay(dayKey, {
      entriesByDay,
      blocksByDay,
      ghostsByDay,
      taskById,
      blockById,
      runningEntry: runningEntry[0],
      now,
      todayKey,
    }),
  );

  return {
    days,
    workStartMinute: WORK_START_MINUTE,
    workEndMinute: WORK_END_MINUTE,
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
