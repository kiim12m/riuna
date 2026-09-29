import { and, asc, between, eq } from "drizzle-orm";
import db from "../../database";
import { projectTable, taskTable, timeEntryTable } from "../../database/schema";
import { serverDayKey } from "../../utils/day-boundaries";
import type { TimeSheetGroupBy } from "../constants";

export type TimeSheetEntry = {
  id: string;
  taskId: string;
  taskTitle: string;
  projectId: string;
  projectName: string;
  startTime: Date;
  endTime: Date | null;
  seconds: number;
};

export type TimeSheetGroup = {
  key: string;
  label: string;
  seconds: number;
  entryCount: number;
  /** Siempre las de quien mira: el parte de horas no lee tiempo de nadie mas. */
  entries: TimeSheetEntry[];
};

export type TimeSheetResult = {
  groupBy: TimeSheetGroupBy;
  windowStart: Date;
  windowEnd: Date;
  totalSeconds: number;
  groups: TimeSheetGroup[];
};

type Row = {
  id: string;
  taskId: string;
  taskTitle: string;
  projectId: string;
  projectName: string;
  startTime: Date;
  endTime: Date | null;
  duration: number | null;
};

function groupKey(groupBy: TimeSheetGroupBy, row: Row): [string, string] {
  if (groupBy === "task") return [row.taskId, row.taskTitle];
  if (groupBy === "project") return [row.projectId, row.projectName];
  const key = serverDayKey(row.startTime);
  return [key, key];
}

/**
 * El parte de horas de quien mira, cruzando proyectos del espacio (ADR 042).
 * Los proyectos archivados no se excluyen: es un informe historico.
 *
 * Cada grupo lleva sus `entries` -no solo el agregado-, para que la pantalla
 * las despliegue, edite y borre una a una (ADR 044): son siempre propias, asi
 * que no hace falta una bandera de "es mia".
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
      id: timeEntryTable.id,
      taskId: timeEntryTable.taskId,
      taskTitle: taskTable.title,
      projectId: taskTable.projectId,
      projectName: projectTable.name,
      startTime: timeEntryTable.startTime,
      endTime: timeEntryTable.endTime,
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
    )
    .orderBy(asc(timeEntryTable.startTime));

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
    const entry: TimeSheetEntry = {
      id: row.id,
      taskId: row.taskId,
      taskTitle: row.taskTitle,
      projectId: row.projectId,
      projectName: row.projectName,
      startTime: row.startTime,
      endTime: row.endTime,
      seconds,
    };

    const existing = groups.get(key);
    if (existing) {
      existing.seconds += seconds;
      existing.entryCount += 1;
      existing.entries.push(entry);
    } else {
      groups.set(key, {
        key,
        label,
        seconds,
        entryCount: 1,
        entries: [entry],
      });
    }
  }

  const groupList = [...groups.values()].sort((a, b) =>
    groupBy === "day" ? a.key.localeCompare(b.key) : b.seconds - a.seconds,
  );

  return { groupBy, windowStart, windowEnd, totalSeconds, groups: groupList };
}
