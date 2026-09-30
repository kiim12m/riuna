import { and, between, eq, isNull } from "drizzle-orm";
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
  const [singleBlocks, repeatingBlocks] = await Promise.all([
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
  ]);

  const blocksByDay = new Map<string, ScheduleBlockRow[]>();
  for (const block of singleBlocks) {
    if (!block.plannedDate) continue;
    const key = serverDayKey(block.plannedDate);
    const list = blocksByDay.get(key) ?? [];
    list.push(block);
    blocksByDay.set(key, list);
  }

  projectRepeatingBlocks(repeatingBlocks, blocksByDay, windowStart, windowEnd);

  const blocksById = new Map(
    [...singleBlocks, ...repeatingBlocks].map((block) => [block.id, block]),
  );

  return { blocksByDay, blocksById };
}
