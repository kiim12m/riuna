import { and, eq, inArray } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { dashboardWidgetTable } from "../../database/schema";

/**
 * Coloca los widgets en el orden recibido.
 *
 * Se comprueba que los ids son **todos** de este panel antes de escribir nada:
 * sin eso, una peticion con un id ajeno reordenaria el panel de otra persona.
 */
export default async function reorderWidgets(
  dashboardId: string,
  widgetIds: string[],
) {
  if (widgetIds.length === 0) return { reordered: 0 };

  const owned = await db
    .select({ id: dashboardWidgetTable.id })
    .from(dashboardWidgetTable)
    .where(
      and(
        eq(dashboardWidgetTable.dashboardId, dashboardId),
        inArray(dashboardWidgetTable.id, widgetIds),
      ),
    );

  if (owned.length !== widgetIds.length) {
    throw new HTTPException(400, {
      message: "Every widget must belong to this dashboard",
    });
  }

  await db.transaction(async (tx) => {
    for (const [position, id] of widgetIds.entries()) {
      await tx
        .update(dashboardWidgetTable)
        .set({ position })
        .where(eq(dashboardWidgetTable.id, id));
    }
  });

  return { reordered: widgetIds.length };
}
