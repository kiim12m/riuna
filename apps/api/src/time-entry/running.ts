import { and, desc, eq, isNotNull, isNull } from "drizzle-orm";
import db from "../database";
import { projectTable, taskTable, timeEntryTable } from "../database/schema";
import { getWorkspaceColumns, notDoneCondition } from "../my-work/decorate";
import { resolveDuration } from "./duration";

type DbOrTx = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * La entrada en marcha de una persona, si tiene alguna. `end_time IS NULL` es
 * "en marcha" (ADR 044) -un solo cronometro por persona, en todo el servidor
 * y no por espacio, porque quien mira solo puede estar haciendo una cosa a
 * la vez-.
 *
 * Comparten esta consulta el pie de la barra lateral y el Cronograma
 * (`schedule/controllers/get-schedule.ts`), que antes tenia su propia copia.
 */
export async function getRunningEntry(userId: string, database: DbOrTx = db) {
  const [entry] = await database
    .select()
    .from(timeEntryTable)
    .where(
      and(eq(timeEntryTable.userId, userId), isNull(timeEntryTable.endTime)),
    )
    .limit(1);

  return entry;
}

export type LastEntry = {
  id: string;
  taskId: string;
  startTime: Date;
  endTime: Date | null;
  taskTitle: string;
  taskNumber: number | null;
  projectId: string;
};

/**
 * La ultima entrada cerrada de la persona cuya tarea sigue sin terminar,
 * dentro del espacio dado. Es lo que ofrece "Reanudar" en el pie cuando no
 * hay nada en marcha -el play de la cabecera de super-productivity hace lo
 * mismo con `lastCurrentTaskId`, tambien limitado a una tarea que sigue sin
 * terminar-.
 */
export async function getLastEntry(
  userId: string,
  workspaceId: string,
): Promise<LastEntry | undefined> {
  const projectColumns = await getWorkspaceColumns(workspaceId);
  const notDone = notDoneCondition(projectColumns);

  const conditions = [
    eq(timeEntryTable.userId, userId),
    eq(projectTable.workspaceId, workspaceId),
    isNotNull(timeEntryTable.endTime),
  ];
  if (notDone) conditions.push(notDone);

  const [entry] = await db
    .select({
      id: timeEntryTable.id,
      taskId: timeEntryTable.taskId,
      startTime: timeEntryTable.startTime,
      endTime: timeEntryTable.endTime,
      taskTitle: taskTable.title,
      taskNumber: taskTable.number,
      projectId: taskTable.projectId,
    })
    .from(timeEntryTable)
    .innerJoin(taskTable, eq(timeEntryTable.taskId, taskTable.id))
    .innerJoin(projectTable, eq(taskTable.projectId, projectTable.id))
    .where(and(...conditions))
    .orderBy(desc(timeEntryTable.startTime))
    .limit(1);

  return entry;
}

/**
 * Cierra la entrada en marcha de una persona, si tiene alguna. Usa siempre
 * `tx` cuando arranca otra en la misma transaccion (`start-timer.ts`): cerrar
 * y abrir tienen que pasar juntas o el indice unico (ADR 044) rechazaria la
 * segunda mientras la primera sigue abierta.
 */
export async function closeRunningEntry(
  database: DbOrTx,
  userId: string,
  at: Date,
) {
  const [running] = await database
    .select()
    .from(timeEntryTable)
    .where(
      and(eq(timeEntryTable.userId, userId), isNull(timeEntryTable.endTime)),
    )
    .limit(1);

  if (!running) {
    return null;
  }

  const duration = resolveDuration(running.startTime, at);

  const [closed] = await database
    .update(timeEntryTable)
    .set({ endTime: at, duration })
    .where(eq(timeEntryTable.id, running.id))
    .returning();

  return closed;
}
