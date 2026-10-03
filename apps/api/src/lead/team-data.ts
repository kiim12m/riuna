import {
  and,
  asc,
  between,
  eq,
  inArray,
  isNotNull,
  isNull,
  ne,
  or,
} from "drizzle-orm";
import db from "../database";
import {
  personalPlanEntryTable,
  projectTable,
  reviewTable,
  taskAssigneeTable,
  taskTable,
  timeEntryTable,
  userTable,
} from "../database/schema";
import type { DaySummary } from "../review/controllers/get-review";

/**
 * Lo que lee el responsable de departamento (ADR 059), **en lote**: una
 * consulta por cosa para todo el equipo, nunca una por persona. Quien llama
 * ya paso por `visibility.ts`: aqui solo llegan ids que el responsable puede
 * ver. Ninguna de estas consultas toca la valoracion privada de los cierres.
 */

export async function loadPeople(userIds: string[]) {
  if (userIds.length === 0) return [];
  return db
    .select({ id: userTable.id, name: userTable.name, image: userTable.image })
    .from(userTable)
    .where(inArray(userTable.id, userIds))
    .orderBy(asc(userTable.name));
}

/** Las entradas del plan de todos en una ventana, con su tarea. */
export async function loadPlanned(
  workspaceId: string,
  userIds: string[],
  start: Date,
  end: Date,
) {
  if (userIds.length === 0) return [];
  return db
    .select({
      userId: personalPlanEntryTable.userId,
      plannedDate: personalPlanEntryTable.plannedDate,
      startMinute: personalPlanEntryTable.startMinute,
      keyRank: personalPlanEntryTable.keyRank,
      position: personalPlanEntryTable.position,
      id: taskTable.id,
      number: taskTable.number,
      title: taskTable.title,
      status: taskTable.status,
      estimate: taskTable.estimate,
      projectId: taskTable.projectId,
      projectSlug: projectTable.slug,
    })
    .from(personalPlanEntryTable)
    .innerJoin(taskTable, eq(personalPlanEntryTable.taskId, taskTable.id))
    .innerJoin(projectTable, eq(taskTable.projectId, projectTable.id))
    .where(
      and(
        inArray(personalPlanEntryTable.userId, userIds),
        eq(personalPlanEntryTable.workspaceId, workspaceId),
        between(personalPlanEntryTable.plannedDate, start, end),
      ),
    )
    .orderBy(
      asc(personalPlanEntryTable.plannedDate),
      asc(personalPlanEntryTable.position),
      asc(personalPlanEntryTable.taskId),
    );
}

/**
 * Lo terminado en una ventana y relevante para cada uno -asignado, o
 * planificado por el ese dia-, el mismo criterio que «Hechas» de Hoy. Una
 * fila por tarea y persona: quien llama reparte por `userId`.
 */
export async function loadDone(
  workspaceId: string,
  userIds: string[],
  start: Date,
  end: Date,
) {
  if (userIds.length === 0) return [];
  const rows = await db
    .select({
      assigneeId: taskAssigneeTable.userId,
      plannerId: personalPlanEntryTable.userId,
      plannedDate: personalPlanEntryTable.plannedDate,
      completedAt: taskTable.completedAt,
      id: taskTable.id,
      number: taskTable.number,
      title: taskTable.title,
      projectSlug: projectTable.slug,
    })
    .from(taskTable)
    .innerJoin(projectTable, eq(taskTable.projectId, projectTable.id))
    .leftJoin(
      taskAssigneeTable,
      and(
        eq(taskAssigneeTable.taskId, taskTable.id),
        inArray(taskAssigneeTable.userId, userIds),
      ),
    )
    .leftJoin(
      personalPlanEntryTable,
      and(
        eq(personalPlanEntryTable.taskId, taskTable.id),
        inArray(personalPlanEntryTable.userId, userIds),
        eq(personalPlanEntryTable.workspaceId, workspaceId),
      ),
    )
    .where(
      and(
        eq(projectTable.workspaceId, workspaceId),
        isNull(projectTable.archivedAt),
        ne(taskTable.status, "archived"),
        isNotNull(taskTable.completedAt),
        between(taskTable.completedAt, start, end),
        or(
          isNotNull(taskAssigneeTable.userId),
          isNotNull(personalPlanEntryTable.userId),
        ),
      ),
    );

  return doneByPerson(rows);
}

type DoneRow = {
  assigneeId: string | null;
  plannerId: string | null;
  plannedDate: Date | null;
  completedAt: Date | null;
  id: string;
  number: number | null;
  title: string;
  projectSlug: string;
};

/**
 * Reparte lo terminado por persona: una fila por tarea y persona, asignada
 * o que la planifico. El cruce de la consulta repite la tarea por cada
 * asignado del equipo, asi que **ser asignado se decide mirando todas sus
 * filas**, no la primera: si no, quien la planifico y tambien la tenia
 * asignada podia salir como «solo la planifico» y caerse del dia (revision
 * de codigo del interludio, hallazgo 5).
 */
export function doneByPerson(rows: DoneRow[]) {
  const assigneesOf = new Map<string, Set<string>>();
  for (const row of rows) {
    if (!row.assigneeId) continue;
    const assignees = assigneesOf.get(row.id) ?? new Set<string>();
    assignees.add(row.assigneeId);
    assigneesOf.set(row.id, assignees);
  }

  const seen = new Set<string>();
  return rows.flatMap((row) =>
    [row.assigneeId, row.plannerId]
      .filter((userId): userId is string => {
        if (!userId) return false;
        const key = `${userId}:${row.id}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((userId) => ({
        userId,
        viaPlan: !assigneesOf.get(row.id)?.has(userId),
        plannedDate: row.plannedDate,
        completedAt: row.completedAt as Date,
        id: row.id,
        number: row.number,
        title: row.title,
        projectSlug: row.projectSlug,
      })),
  );
}

/** Lo registrado por cada uno en una ventana, con el cronometro en marcha. */
export async function loadWorked(
  workspaceId: string,
  userIds: string[],
  start: Date,
  end: Date,
  now: Date,
) {
  const worked = new Map<string, number>(userIds.map((id) => [id, 0]));
  if (userIds.length === 0) return worked;
  const rows = await db
    .select({
      userId: timeEntryTable.userId,
      startTime: timeEntryTable.startTime,
      duration: timeEntryTable.duration,
      endTime: timeEntryTable.endTime,
    })
    .from(timeEntryTable)
    .innerJoin(taskTable, eq(timeEntryTable.taskId, taskTable.id))
    .innerJoin(projectTable, eq(taskTable.projectId, projectTable.id))
    .where(
      and(
        inArray(timeEntryTable.userId, userIds),
        eq(projectTable.workspaceId, workspaceId),
        between(timeEntryTable.startTime, start, end),
      ),
    );
  for (const row of rows) {
    // `time_entry.user_id` admite nulos en el esquema heredado; el filtro de
    // arriba ya los deja fuera.
    if (row.userId === null) continue;
    const seconds =
      row.endTime === null
        ? Math.max(
            0,
            Math.round((now.getTime() - row.startTime.getTime()) / 1000),
          )
        : (row.duration ?? 0);
    worked.set(row.userId, (worked.get(row.userId) ?? 0) + seconds);
  }
  return worked;
}

/**
 * Los cierres de dia de todos en unos dias: **solo la parte visible**, los
 * bloqueos y las cifras (ADR 054). La valoracion vive en otra tabla que este
 * modulo no puede nombrar.
 */
export async function loadCloses(
  workspaceId: string,
  userIds: string[],
  days: Date[],
) {
  if (userIds.length === 0 || days.length === 0) return [];
  const rows = await db
    .select({
      userId: reviewTable.userId,
      periodStart: reviewTable.periodStart,
      blockers: reviewTable.blockers,
      summary: reviewTable.summary,
    })
    .from(reviewTable)
    .where(
      and(
        inArray(reviewTable.userId, userIds),
        eq(reviewTable.workspaceId, workspaceId),
        eq(reviewTable.period, "day"),
        inArray(reviewTable.periodStart, days),
      ),
    );
  return rows.map((row) => ({ ...row, summary: row.summary as DaySummary }));
}
