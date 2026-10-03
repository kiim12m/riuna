import { and, eq } from "drizzle-orm";
import db from "../../database";
import { personalPlanEntryTable } from "../../database/schema";
import { serverDayKey } from "../../utils/day-boundaries";

/**
 * El sitio de **una** tarea en el plan de quien mira, para el detalle de la
 * tarea: "Planificada: lun 6". Acotada por usuario **y** espacio, como el
 * resto del modulo: una entrada es unica por `(userId, taskId)` sin importar
 * en que espacio se creo, y las ADR 041, 046 y 047 ya pagaron tres veces que
 * una consulta de esta tabla olvidara el espacio.
 *
 * El dia sale como clave `yyyy-mm-dd` calculada aqui (`serverDayKey`) y no
 * como instante: la columna guarda la medianoche de Madrid (ADR 049), y que
 * cada cliente la recorte a su manera es justo lo que ya fallo una vez.
 */
export default async function getPlanEntry({
  userId,
  workspaceId,
  taskId,
}: {
  userId: string;
  workspaceId: string;
  taskId: string;
}) {
  const [row] = await db
    .select({
      plannedDate: personalPlanEntryTable.plannedDate,
      startMinute: personalPlanEntryTable.startMinute,
      keyRank: personalPlanEntryTable.keyRank,
    })
    .from(personalPlanEntryTable)
    .where(
      and(
        eq(personalPlanEntryTable.userId, userId),
        eq(personalPlanEntryTable.workspaceId, workspaceId),
        eq(personalPlanEntryTable.taskId, taskId),
      ),
    );

  return {
    entry: row
      ? {
          plannedDay: serverDayKey(row.plannedDate),
          startMinute: row.startMinute,
          keyRank: row.keyRank,
        }
      : null,
  };
}
