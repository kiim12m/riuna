import { and, asc, eq, inArray, or } from "drizzle-orm";
import db from "../../database";
import { dashboardTable, dashboardWidgetTable } from "../../database/schema";
import { isUniqueViolation } from "../../utils/is-unique-violation";
import { defaultWidgetRows } from "../default-layout";

/**
 * Los paneles de quien pregunta en este espacio, con sus widgets.
 *
 * La primera vez siembra el panel de partida: un panel vacio no responde nada,
 * y pedir que lo monte quien acaba de entrar es pedirle que sepa antes que
 * mirar. A partir de ahi las filas son suyas y esto no vuelve a tocarlas.
 */
export default async function getDashboards(
  workspaceId: string,
  userId: string,
) {
  const dashboards = await readDashboards(workspaceId, userId);

  // La siembra mira si tiene panel **propio**, no si ve alguno: entrar en un
  // espacio donde alguien ya comparte el suyo no puede dejarte sin el tuyo.
  if (!dashboards.some((dashboard) => dashboard.createdBy === userId)) {
    return seedDefaultDashboard(workspaceId, userId);
  }

  return dashboards;
}

async function readDashboards(workspaceId: string, userId: string) {
  const dashboards = await db
    .select()
    .from(dashboardTable)
    .where(
      and(
        eq(dashboardTable.workspaceId, workspaceId),
        // Los propios mas los que alguien ha compartido con el espacio, igual
        // que las vistas (ADR 015).
        or(
          eq(dashboardTable.createdBy, userId),
          eq(dashboardTable.isShared, true),
        ),
      ),
    )
    .orderBy(asc(dashboardTable.position), asc(dashboardTable.createdAt));

  // Salida temprana obligatoria: `inArray(col, [])` compila a `in ()`, que es
  // un error de sintaxis de Postgres, no una lista vacia.
  if (dashboards.length === 0) return [];

  // Una consulta para todos los widgets, no una por panel.
  const widgets = await db
    .select()
    .from(dashboardWidgetTable)
    .where(
      inArray(
        dashboardWidgetTable.dashboardId,
        dashboards.map((dashboard) => dashboard.id),
      ),
    )
    .orderBy(asc(dashboardWidgetTable.position));

  const byDashboard = new Map<string, typeof widgets>();
  for (const widget of widgets) {
    const list = byDashboard.get(widget.dashboardId) ?? [];
    list.push(widget);
    byDashboard.set(widget.dashboardId, list);
  }

  return dashboards.map((dashboard) => ({
    ...dashboard,
    widgets: byDashboard.get(dashboard.id) ?? [],
  }));
}

/**
 * Crea el panel de partida y lo devuelve.
 *
 * El indice unico parcial `dashboard_one_default_per_person` es lo que impide
 * que dos cargas simultaneas la primera vez creen dos paneles. Si otra peticion
 * gana la carrera, esta se limita a releer: es una condicion normal, no un
 * fallo, y por eso no sube como error.
 */
async function seedDefaultDashboard(workspaceId: string, userId: string) {
  try {
    await db.transaction(async (tx) => {
      const [dashboard] = await tx
        .insert(dashboardTable)
        .values({
          workspaceId,
          createdBy: userId,
          name: "Mi panel",
          isDefault: true,
        })
        .returning();

      if (!dashboard) return;

      await tx
        .insert(dashboardWidgetTable)
        .values(defaultWidgetRows(dashboard.id));
    });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
  }

  return readDashboards(workspaceId, userId);
}
