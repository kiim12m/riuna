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
import {
  firstOnOrAfter,
  nextOccurrence,
  parseCadence,
} from "../../recurrence/cadence";
import { serverDayKey } from "../../utils/day-boundaries";
import {
  MIN_ENTRY_DURATION_SECONDS,
  WORK_END_MINUTE,
  WORK_START_MINUTE,
} from "../constants";
import { type BlockerInput, type FlowEntry, layoutDay } from "../layout";

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

const secondsSinceMidnight = (date: Date): number =>
  date.getHours() * 3600 + date.getMinutes() * 60 + date.getSeconds();

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

  // Los bloques repetidos se proyectan igual que los fantasmas del
  // Planificador: nunca se guarda una fila por ocurrencia.
  for (const block of repeatingBlocks) {
    if (!block.cadence) continue;
    try {
      const cadence = parseCadence(block.cadence);
      let cursor = firstOnOrAfter(cadence, windowStart);
      while (cursor <= windowEnd) {
        const key = serverDayKey(cursor);
        const list = blocksByDay.get(key) ?? [];
        list.push(block);
        blocksByDay.set(key, list);
        cursor = nextOccurrence(cadence, cursor);
      }
    } catch {
      // Fila corrupta: se ignora en vez de tumbar el Cronograma entero.
    }
  }

  const ghostsByDay = new Map<string, typeof ghosts>();
  for (const ghost of ghosts) {
    const key = serverDayKey(ghost.plannedDate);
    const list = ghostsByDay.get(key) ?? [];
    list.push(ghost);
    ghostsByDay.set(key, list);
  }

  const taskById = new Map(decoratedEntries.map((entry) => [entry.id, entry]));

  const days = buildDayKeys(windowStart, windowEnd).map((dayKey) => {
    const dayEntries = entriesByDay.get(dayKey) ?? [];
    const dayBlocks = blocksByDay.get(dayKey) ?? [];
    const isToday = dayKey === todayKey;

    const flowEntries: FlowEntry[] = dayEntries.map((entry) => ({
      taskId: entry.id,
      estimateSeconds: Math.max(
        entry.estimate ?? 0,
        MIN_ENTRY_DURATION_SECONDS,
      ),
      position: entry.position,
      pinnedStartSecond:
        entry.startMinute === null ? null : entry.startMinute * 60,
    }));

    const blockers: BlockerInput[] = dayBlocks.map((block) => ({
      id: block.id,
      kind: block.kind as "fixed" | "break",
      title: block.title,
      startSecond: block.startMinute * 60,
      endSecond: block.endMinute * 60,
    }));

    if (isToday && runningEntry[0]) {
      const running = runningEntry[0];
      blockers.push({
        id: running.id,
        kind: "running",
        title: "",
        startSecond: secondsSinceMidnight(running.startTime),
        endSecond: secondsSinceMidnight(now),
      });
    }

    const dayStartSecond = isToday
      ? Math.max(WORK_START_MINUTE * 60, secondsSinceMidnight(now))
      : WORK_START_MINUTE * 60;

    const layout = layoutDay({
      flowEntries,
      blockers,
      dayStartSecond,
      dayEndSecond: WORK_END_MINUTE * 60,
    });

    return {
      dayDate: dayKey,
      isToday,
      segments: layout.segments.map((segment) =>
        segment.type === "block"
          ? segment
          : { ...segment, task: taskById.get(segment.taskId) ?? null },
      ),
      overflow: layout.overflow.map((entry) => ({
        ...entry,
        task: taskById.get(entry.taskId) ?? null,
      })),
      ghosts: ghostsByDay.get(dayKey) ?? [],
    };
  });

  return {
    days,
    workStartMinute: WORK_START_MINUTE,
    workEndMinute: WORK_END_MINUTE,
  };
}
