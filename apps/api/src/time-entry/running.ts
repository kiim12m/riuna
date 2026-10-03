import { and, desc, eq, gte, isNotNull, isNull, lt } from "drizzle-orm";
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

/**
 * Un hueco de al menos esto sin cronometro cuenta como descanso para los
 * avisos de ritmo (ADR 056): cambiar de tarea no es descansar.
 */
export const BREAK_GAP_MS = 5 * 60 * 1000;

/** Mas atras no se busca: nadie trabaja doce horas sin un hueco. */
const STREAK_LOOKBACK_MS = 12 * 60 * 60 * 1000;

/**
 * Desde cuando trabaja sin descanso quien tiene el cronometro en marcha: el
 * principio de la cadena de entradas que acaba en la que corre, sin huecos de
 * `BREAK_GAP_MS` o mas entre ellas. Cuenta todos los espacios: es la misma
 * persona trabajando.
 */
export async function getWorkingSince(
  userId: string,
  running: { startTime: Date },
): Promise<Date> {
  const earlier = await db
    .select({
      startTime: timeEntryTable.startTime,
      endTime: timeEntryTable.endTime,
    })
    .from(timeEntryTable)
    .where(
      and(
        eq(timeEntryTable.userId, userId),
        isNotNull(timeEntryTable.endTime),
        lt(timeEntryTable.startTime, running.startTime),
        gte(
          timeEntryTable.startTime,
          new Date(running.startTime.getTime() - STREAK_LOOKBACK_MS),
        ),
      ),
    )
    .orderBy(desc(timeEntryTable.startTime));

  let since = running.startTime;
  for (const entry of earlier) {
    if (!entry.endTime) continue;
    if (entry.endTime.getTime() <= since.getTime() - BREAK_GAP_MS) break;
    if (entry.startTime < since) since = entry.startTime;
  }
  return since;
}

/**
 * Cuando acabo la ultima entrada de la persona, en cualquier espacio: lo que
 * mira el aviso de "no estas registrando". La que empezo la ultima es, salvo
 * entradas a mano raras, la que acabo la ultima, y asi el indice
 * `(user_id, start_time)` sirve.
 */
export async function getLastStoppedAt(userId: string): Promise<Date | null> {
  const [entry] = await db
    .select({ endTime: timeEntryTable.endTime })
    .from(timeEntryTable)
    .where(
      and(eq(timeEntryTable.userId, userId), isNotNull(timeEntryTable.endTime)),
    )
    .orderBy(desc(timeEntryTable.startTime))
    .limit(1);

  return entry?.endTime ?? null;
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
