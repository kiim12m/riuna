import { and, asc, eq, gte, inArray, lt, lte, type SQL } from "drizzle-orm";
import db from "../database";
import {
  personalPlanEntryTable,
  projectTable,
  taskTable,
  teamTable,
  timeEntryTable,
} from "../database/schema";

/**
 * Las columnas de tarea que comparten el Planificador y Hoy -las dos
 * lecturas que cruzan proyectos sobre `personal_plan_entry` (ADR 040,
 * ADR 046)-.
 */
export const taskColumns = {
  id: taskTable.id,
  number: taskTable.number,
  title: taskTable.title,
  status: taskTable.status,
  priority: taskTable.priority,
  estimate: taskTable.estimate,
  dueDate: taskTable.dueDate,
  projectId: taskTable.projectId,
  projectName: projectTable.name,
  projectSlug: projectTable.slug,
  projectIcon: projectTable.icon,
  teamId: taskTable.teamId,
  teamName: teamTable.name,
};

export const entryColumns = {
  ...taskColumns,
  plannedDate: personalPlanEntryTable.plannedDate,
  position: personalPlanEntryTable.position,
  startMinute: personalPlanEntryTable.startMinute,
  keyRank: personalPlanEntryTable.keyRank,
};

/**
 * Entradas del plan de una persona dentro de un rango de fechas, con la tarea
 * y el proyecto ya unidos. El Planificador la usa para su ventana rodante;
 * Hoy, con `start`/`end` acotados al dia del servidor, para "planificadas
 * hoy".
 */
export async function getEntriesInRange(
  workspaceId: string,
  userId: string,
  start: Date,
  end: Date,
  extraConditions: SQL[] = [],
) {
  return db
    .select(entryColumns)
    .from(personalPlanEntryTable)
    .innerJoin(taskTable, eq(personalPlanEntryTable.taskId, taskTable.id))
    .innerJoin(projectTable, eq(taskTable.projectId, projectTable.id))
    .leftJoin(teamTable, eq(taskTable.teamId, teamTable.id))
    .where(
      and(
        eq(personalPlanEntryTable.userId, userId),
        // Sin esto, una entrada planeada desde otro espacio del mismo
        // usuario se colaba aqui en una fecha compartida (ADR 046).
        eq(personalPlanEntryTable.workspaceId, workspaceId),
        gte(personalPlanEntryTable.plannedDate, start),
        lte(personalPlanEntryTable.plannedDate, end),
        ...extraConditions,
      ),
    )
    .orderBy(
      asc(personalPlanEntryTable.plannedDate),
      asc(personalPlanEntryTable.position),
      // Desempate: dos filas nunca deberian compartir posicion, pero sin un
      // orden total dos paginas -o dos renders- podrian discreparse entre si
      // si alguna vez lo hicieran.
      asc(personalPlanEntryTable.taskId),
    );
}

/**
 * "De dias anteriores" (super-productivity): planificadas antes de `before`
 * y todavia sin terminar si se pasa `notDoneCondition`. Sin limite hacia
 * atras -declarado en la ADR 046-. Comparten esta lista el Planificador y
 * Hoy: la misma tarea atrasada tiene que verse igual en los dos sitios.
 */
export async function getPreviousEntries(
  workspaceId: string,
  userId: string,
  before: Date,
  extraConditions: SQL[] = [],
) {
  return db
    .select(entryColumns)
    .from(personalPlanEntryTable)
    .innerJoin(taskTable, eq(personalPlanEntryTable.taskId, taskTable.id))
    .innerJoin(projectTable, eq(taskTable.projectId, projectTable.id))
    .leftJoin(teamTable, eq(taskTable.teamId, teamTable.id))
    .where(
      and(
        eq(personalPlanEntryTable.userId, userId),
        eq(personalPlanEntryTable.workspaceId, workspaceId),
        lt(personalPlanEntryTable.plannedDate, before),
        ...extraConditions,
      ),
    )
    .orderBy(asc(personalPlanEntryTable.plannedDate));
}

/**
 * Lo registrado por tarea, sumando solo entradas cerradas -igual que
 * `task/tree-aggregates.ts`-: la entrada en marcha no cuenta aqui su
 * transcurrido en vivo, que solo existe una vez por persona (ADR 044) y ni
 * el Planificador ni Hoy repintan cada segundo.
 */
export async function loggedSecondsByTask(
  taskIds: string[],
): Promise<Map<string, number>> {
  if (taskIds.length === 0) return new Map();

  const rows = await db
    .select({
      taskId: timeEntryTable.taskId,
      duration: timeEntryTable.duration,
    })
    .from(timeEntryTable)
    .where(inArray(timeEntryTable.taskId, taskIds));

  const totals = new Map<string, number>();
  for (const row of rows) {
    totals.set(row.taskId, (totals.get(row.taskId) ?? 0) + (row.duration ?? 0));
  }
  return totals;
}
