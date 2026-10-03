import { and, between, eq, inArray, isNull } from "drizzle-orm";
import db from "../database";
import { scheduleBlockTable } from "../database/schema";
import { serverDayKey } from "../utils/day-boundaries";
import { projectRepeatingBlocks } from "./build-day";

export type ScheduleBlockRow = typeof scheduleBlockTable.$inferSelect;

/**
 * Los bloques -fijos y de descanso, sueltos y repetidos- de una persona
 * dentro de una ventana, ya proyectados y agrupados por dia. Comparten esto
 * `get-schedule.ts` (para pintarlos) y `work-schedule/` (para restar los
 * `break` de la capacidad del Planificador, ADR 045): antes solo existia
 * dentro de `getSchedule`, sin forma de pedirlo aparte.
 */
export type BlocksByDay = {
  blocksByDay: Map<string, ScheduleBlockRow[]>;
  /**
   * La fila real de cada bloque, sueltos y repetidos, por id -lo que hace
   * falta para prellenar el dialogo de editar uno: `blocksByDay` guarda el
   * tramo ya recortado a la ventana, no su horario propio si se fusiono con
   * otro que se solapaba.
   */
  blocksById: Map<string, ScheduleBlockRow>;
};

export async function loadBlocksByDay(
  workspaceId: string,
  userId: string,
  windowStart: Date,
  windowEnd: Date,
): Promise<BlocksByDay> {
  const byUser = await loadBlocksByDayForUsers(
    workspaceId,
    [userId],
    windowStart,
    windowEnd,
  );
  return (
    byUser.get(userId) ?? { blocksByDay: new Map(), blocksById: new Map() }
  );
}

/**
 * `loadBlocksByDay` para varias personas en dos consultas, para la vista del
 * responsable de departamento (ADR 059). La version de una persona es este
 * mismo camino con una sola: la regla de que bloques valen vive aqui una vez.
 */
export async function loadBlocksByDayForUsers(
  workspaceId: string,
  userIds: string[],
  windowStart: Date,
  windowEnd: Date,
): Promise<Map<string, BlocksByDay>> {
  const byUser = new Map<string, BlocksByDay>(
    userIds.map((userId) => [
      userId,
      { blocksByDay: new Map(), blocksById: new Map() },
    ]),
  );
  // Sin esta salida, `inArray(col, [])` compila a `in ()`.
  if (userIds.length === 0) return byUser;

  const [singleBlocks, repeatingBlocks] = await Promise.all([
    db
      .select()
      .from(scheduleBlockTable)
      .where(
        and(
          eq(scheduleBlockTable.workspaceId, workspaceId),
          inArray(scheduleBlockTable.userId, userIds),
          between(scheduleBlockTable.plannedDate, windowStart, windowEnd),
        ),
      ),
    db
      .select()
      .from(scheduleBlockTable)
      .where(
        and(
          eq(scheduleBlockTable.workspaceId, workspaceId),
          inArray(scheduleBlockTable.userId, userIds),
          isNull(scheduleBlockTable.plannedDate),
        ),
      ),
  ]);

  for (const block of singleBlocks) {
    const user = byUser.get(block.userId);
    if (!user || !block.plannedDate) continue;
    const key = serverDayKey(block.plannedDate);
    const list = user.blocksByDay.get(key) ?? [];
    list.push(block);
    user.blocksByDay.set(key, list);
    user.blocksById.set(block.id, block);
  }

  for (const [userId, user] of byUser) {
    const repeating = repeatingBlocks.filter(
      (block) => block.userId === userId,
    );
    projectRepeatingBlocks(repeating, user.blocksByDay, windowStart, windowEnd);
    for (const block of repeating) user.blocksById.set(block.id, block);
  }

  return byUser;
}
