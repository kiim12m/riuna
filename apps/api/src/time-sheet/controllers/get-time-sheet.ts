import { and, between, eq } from "drizzle-orm";
import db from "../../database";
import { projectTable, taskTable, timeEntryTable } from "../../database/schema";
import type { TimeSheetGroupBy } from "../constants";

export type TimeSheetGroup = {
  key: string;
  label: string;
  seconds: number;
  entryCount: number;
};

export type TimeSheetResult = {
  groupBy: TimeSheetGroupBy;
  windowStart: Date;
  windowEnd: Date;
  totalSeconds: number;
  groups: TimeSheetGroup[];
};

const dateKey = (date: Date): string => date.toISOString().slice(0, 10);

type Row = {
  taskId: string;
  taskTitle: string;
  projectId: string;
  projectName: string;
  startTime: Date;
};

function groupKey(groupBy: TimeSheetGroupBy, row: Row): [string, string] {
  if (groupBy === "task") return [row.taskId, row.taskTitle];
  if (groupBy === "project") return [row.projectId, row.projectName];
  const key = dateKey(row.startTime);
  return [key, key];
}

/**
 * El parte de horas de quien mira, cruzando proyectos del espacio (ADR 042).
 * Los proyectos archivados no se excluyen: es un informe historico.
 */
export default async function getTimeSheet({
  workspaceId,
  userId,
  windowStart,
  windowEnd,
  groupBy,
  now = new Date(),
}: {
  workspaceId: string;
  userId: string;
  windowStart: Date;
  windowEnd: Date;
  groupBy: TimeSheetGroupBy;
  now?: Date;
}): Promise<TimeSheetResult> {
  const rows = await db
    .select({
      taskId: timeEntryTable.taskId,
      taskTitle: taskTable.title,
      projectId: taskTable.projectId,
      projectName: projectTable.name,
      startTime: timeEntryTable.startTime,
      duration: timeEntryTable.duration,
    })
    .from(timeEntryTable)
    .innerJoin(taskTable, eq(timeEntryTable.taskId, taskTable.id))
    .innerJoin(projectTable, eq(taskTable.projectId, projectTable.id))
    .where(
      and(
        eq(timeEntryTable.userId, userId),
        eq(projectTable.workspaceId, workspaceId),
        between(timeEntryTable.startTime, windowStart, windowEnd),
      ),
    );

  const groups = new Map<string, TimeSheetGroup>();
  let totalSeconds = 0;

  for (const row of rows) {
    // Una entrada en marcha (duration nula) cuenta lo transcurrido hasta
    // ahora: omitirla del total haria parecer un hueco que no existe.
    const seconds =
      row.duration ??
      Math.max(0, Math.floor((now.getTime() - row.startTime.getTime()) / 1000));
    totalSeconds += seconds;

    const [key, label] = groupKey(groupBy, row);
    const existing = groups.get(key);
    if (existing) {
      existing.seconds += seconds;
      existing.entryCount += 1;
    } else {
      groups.set(key, { key, label, seconds, entryCount: 1 });
    }
  }

  const groupList = [...groups.values()].sort((a, b) =>
    groupBy === "day" ? a.key.localeCompare(b.key) : b.seconds - a.seconds,
  );

  return { groupBy, windowStart, windowEnd, totalSeconds, groups: groupList };
}
