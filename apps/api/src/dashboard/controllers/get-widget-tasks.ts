import { eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { dashboardWidgetTable } from "../../database/schema";
import { getFieldDefinitionsForProject } from "../../field/controllers/get-field-definitions";
import { resolvePaging } from "../../my-work/pagination";
import { startOfServerWeek } from "../../utils/day-boundaries";
import { buildFilter } from "../../view/build-filter";
import { buildFieldRegistry } from "../../view/field-registry";
import { FilterError } from "../../view/filter-to-sql";
import { getWorkspaceFieldRegistry } from "../../view/workspace-registry";
import topTasks from "../top-tasks";
import {
  isTaskCount,
  type WidgetConfig,
  type WidgetType,
} from "../widget-config";
import { countPredicates } from "../widget-predicate";

/**
 * Las tareas que cuenta una tarjeta de recuento, paginadas (ADR 093).
 *
 * **La lista tiene que ser exactamente lo que cuenta la cifra.** Por eso no se
 * vuelve a describir la pregunta: se toman el ambito, el filtro y los
 * predicados de la tarjeta (`countPredicates`), los mismos que usa el barrido
 * colapsado, y se leen con `topTasks`, que ya da las columnas y el orden de la
 * tabla del panel.
 *
 * Sin total: la tarjeta ya lo dice, y contarlo aqui seria un segundo barrido.
 * `hasMore` sale de pedir una fila de mas.
 */
export default async function getWidgetTasks({
  widgetId,
  workspaceId,
  userId,
  weekStartsOn = 1,
  page,
}: {
  widgetId: string;
  workspaceId: string;
  userId: string;
  /** El inicio de semana de quien mira, como en `get-dashboard-data.ts`. */
  weekStartsOn?: number;
  page?: number;
}) {
  const [widget] = await db
    .select()
    .from(dashboardWidgetTable)
    .where(eq(dashboardWidgetTable.id, widgetId))
    .limit(1);

  if (!widget) {
    throw new HTTPException(404, { message: "Widget not found" });
  }

  const config = widget.config as WidgetConfig;

  if (!isTaskCount(widget.type as WidgetType, config)) {
    throw new HTTPException(400, {
      message: "Only a widget that counts tasks can list them",
    });
  }

  // El mismo registro que el panel: con las definiciones archivadas si el
  // widget es de un proyecto, para que archivar un campo no rompa un filtro
  // guardado que lo nombre.
  const registry = widget.projectId
    ? buildFieldRegistry(
        await getFieldDefinitionsForProject(
          workspaceId,
          widget.projectId,
          true,
        ),
      )
    : await getWorkspaceFieldRegistry(workspaceId);

  const now = new Date();
  const { page: resolvedPage, pageSize, offset } = resolvePaging(page);

  try {
    const rows = await topTasks({
      workspaceId,
      userId,
      projectId: widget.projectId,
      scope: config.scope,
      filter: buildFilter(config.filter ?? []),
      registry,
      extra: countPredicates(config, now, startOfServerWeek(now, weekStartsOn)),
      limit: pageSize + 1,
      offset,
    });

    return {
      tasks: rows.slice(0, pageSize),
      page: resolvedPage,
      hasMore: rows.length > pageSize,
    };
  } catch (error) {
    // Un filtro que nombra un campo que ya no existe es un 400 con su nombre,
    // como en `get-dashboard-data.ts`, no un 500.
    if (error instanceof FilterError) {
      throw new HTTPException(400, { message: error.message });
    }
    throw error;
  }
}
