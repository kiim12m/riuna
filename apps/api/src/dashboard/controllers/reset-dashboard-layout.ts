import { eq } from "drizzle-orm";
import db from "../../database";
import { dashboardWidgetTable } from "../../database/schema";
import { defaultWidgetRows } from "../default-layout";

/**
 * Devuelve el panel a la distribucion de partida.
 *
 * Sustituye **todos** sus widgets —tambien los anadidos a mano— y en una
 * transaccion: un fallo a medias dejaria el panel vacio, que es justo lo que la
 * distribucion de partida existe para evitar. El panel en si (nombre, si se
 * comparte) no se toca.
 */
export default async function resetDashboardLayout(dashboardId: string) {
  const rows = defaultWidgetRows(dashboardId);

  await db.transaction(async (tx) => {
    await tx
      .delete(dashboardWidgetTable)
      .where(eq(dashboardWidgetTable.dashboardId, dashboardId));
    await tx.insert(dashboardWidgetTable).values(rows);
  });

  return { widgets: rows.length };
}
