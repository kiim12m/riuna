import { asc, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { dashboardTable, dashboardWidgetTable } from "../../database/schema";
import { getFieldDefinitionsForProject } from "../../field/controllers/get-field-definitions";
import getGoals from "../../goal/controllers/get-goals";
import { startOfServerWeek } from "../../utils/day-boundaries";
import { log } from "../../utils/log";
import { buildFilter } from "../../view/build-filter";
import {
  buildFieldRegistry,
  type FieldRegistry,
} from "../../view/field-registry";
import { FilterError } from "../../view/filter-to-sql";
import { getWorkspaceFieldRegistry } from "../../view/workspace-registry";
import aggregate, { type AggregateResult } from "../aggregate";
import collapseCountWidgets from "../collapse-counts";
import resolveKeys, { type KeyLabel, resolveStatusKeys } from "../resolve-keys";
import topTasks from "../top-tasks";
import weekTasks from "../week-tasks";
import {
  resolveWidget,
  trendRange,
  type WidgetConfig,
  type WidgetType,
} from "../widget-config";
import { widgetPredicates } from "../widget-predicate";

type WidgetPayload =
  | {
      id: string;
      data: {
        buckets?: Awaited<ReturnType<typeof aggregate>>["buckets"];
        truncated?: boolean;
        labels?: Record<string, KeyLabel>;
        rows?: Awaited<ReturnType<typeof topTasks>>;
        week?: {
          start: string;
          days: Awaited<ReturnType<typeof weekTasks>>;
        };
        goal?: Awaited<ReturnType<typeof getGoals>>[number];
      };
    }
  | { id: string; error: string };

/**
 * Los datos de los widgets de un panel, en **una** peticion.
 *
 * No es una comodidad: el pool de la base tiene diez conexiones
 * (`database/index.ts`), asi que cinco widgets como cinco peticiones paralelas
 * serian cinco conexiones por pestana abierta y tres personas mirando su panel
 * dejarian al resto de la API haciendo cola. Por eso el presupuesto de
 * rendimiento de esta pantalla se declara **por panel y no por widget**, que
 * ademas es lo que la persona espera.
 *
 * Y por eso se calculan en serie: en paralelo volverian a ser cinco conexiones.
 *
 * Un widget que falla devuelve su error y **no tumba el panel**. El caso real
 * es el que `get-tasks.ts` ya documenta: archivar una definicion de campo que
 * un filtro guardado nombra convierte esa consulta en un 400. Con un unico
 * codigo para todo, un campo archivado dejaria la pantalla en blanco.
 */
export default async function getDashboardData(
  dashboardId: string,
  workspaceId: string,
  userId: string,
  /**
   * `weekStartsOn` viaja desde el cliente porque es **su** preferencia: la
   * misma que ya leen calendario, Gantt y Cronograma. Un defecto de lunes
   * mantiene compilando a quien llama sin ella, que hoy es la exportacion.
   */
  options: { weekStartsOn?: number } = {},
) {
  const dashboard = await db.query.dashboardTable.findFirst({
    where: eq(dashboardTable.id, dashboardId),
  });

  if (!dashboard) {
    throw new HTTPException(404, { message: "Dashboard not found" });
  }

  const widgets = await db
    .select()
    .from(dashboardWidgetTable)
    .where(eq(dashboardWidgetTable.dashboardId, dashboardId))
    .orderBy(asc(dashboardWidgetTable.position));

  // Los registros se construyen una vez y se reparten: varios widgets del mismo
  // ambito comparten el suyo.
  let workspaceRegistry: FieldRegistry | null = null;
  const projectRegistries = new Map<string, FieldRegistry>();

  async function registryFor(projectId: string | null) {
    if (!projectId) {
      workspaceRegistry ??= await getWorkspaceFieldRegistry(workspaceId);
      return workspaceRegistry;
    }

    const cached = projectRegistries.get(projectId);
    if (cached) return cached;

    // Con las archivadas incluidas, igual que `get-tasks.ts`: archivar un campo
    // no debe romper un filtro guardado que lo nombre.
    const definitions = await getFieldDefinitionsForProject(
      workspaceId,
      projectId,
      true,
    );
    const registry = buildFieldRegistry(definitions);
    projectRegistries.set(projectId, registry);
    return registry;
  }

  // Los objetivos se leen **una vez** y solo si algun widget los pide: la
  // lectura ya mide el progreso de todos sus resultados, asi que pedirla por
  // widget seria repetir el mismo agregado.
  const goals = widgets.some((widget) => widget.type === "goal")
    ? await getGoals(workspaceId, userId)
    : [];

  const now = new Date();
  const weekStart = startOfServerWeek(now, options.weekStartsOn ?? 1);

  // Las tarjetas de recuento que comparten ambito se resuelven en un solo
  // barrido; lo que las distingue viaja dentro de su `FILTER`. Sin esto, una
  // fila de ocho cifras son ocho barridos en serie contra el mismo presupuesto.
  //
  // **Es una optimizacion, asi que no puede tumbar el panel.** Ocurre fuera del
  // `try` por widget que protege al resto, de modo que si fallara —un registro
  // que no se puede leer, una consulta que el planificador rechaza— cada
  // tarjeta vuelve por su cuenta a `aggregate()`, que es la ruta que siempre
  // estuvo ahi. Un panel mas lento es mejor que un panel en blanco.
  let collapsed = new Map<string, AggregateResult>();
  try {
    collapsed = await collapseCountWidgets({
      widgets,
      workspaceId,
      userId,
      now,
      registryFor,
    });
  } catch (error) {
    log.error("[dashboard] collapsed count scan failed", error);
  }

  const payload: WidgetPayload[] = [];

  for (const widget of widgets) {
    try {
      const config = widget.config as WidgetConfig;
      const type = widget.type as WidgetType;
      const registry = await registryFor(widget.projectId);
      const filter = buildFilter(config.filter ?? []);

      if (type === "goal") {
        // Se sirve el objetivo entero con sus resultados ya medidos: es la
        // misma lectura que la pantalla de Objetivos, sin una segunda copia del
        // calculo de progreso.
        const goal = widget.goalId
          ? goals.find((candidate) => candidate.id === widget.goalId)
          : undefined;

        payload.push(
          goal
            ? { id: widget.id, data: { goal } }
            : {
                id: widget.id,
                // Un objetivo compartido puede dejar de estarlo, y entonces el
                // widget de quien no es su dueño se queda sin nada que mirar.
                error: "This goal is no longer available",
              },
        );
        continue;
      }

      // La bandeja la sirve el cliente desde su propia consulta: pedirla aqui
      // duplicaria la lectura que la campana ya tiene abierta.
      if (type === "inbox") {
        payload.push({ id: widget.id, data: {} });
        continue;
      }

      if (type === "week") {
        const days = await weekTasks({
          workspaceId,
          userId,
          projectId: widget.projectId,
          scope: config.scope,
          filter,
          registry,
          weekStart,
        });
        payload.push({
          id: widget.id,
          data: { week: { start: weekStart.toISOString(), days } },
        });
        continue;
      }

      if (type === "table") {
        const rows = await topTasks({
          workspaceId,
          userId,
          projectId: widget.projectId,
          scope: config.scope,
          filter,
          registry,
        });
        payload.push({ id: widget.id, data: { rows } });
        continue;
      }

      const resolved = resolveWidget(type, config, widget.projectId);
      // Toda serie por fecha lleva ventana, no solo la tendencia: el tiempo
      // agrupado por fecha sin ella se quedaba con los cubos mas antiguos. Y
      // desde las tarjetas de la fila de arriba, tambien un recuento sin
      // agrupar que declare `rangeDays`: es como se pregunta "cerradas en los
      // ultimos siete dias".
      const range =
        resolved.groupBy === "time" || config.rangeDays !== undefined
          ? trendRange(config, now)
          : undefined;

      const result =
        collapsed.get(widget.id) ??
        (await aggregate({
          workspaceId,
          userId,
          scope: config.scope,
          projectId: widget.projectId,
          filter,
          registry,
          extra: widgetPredicates(config, now),
          now,
          ...resolved,
          ...(range ?? {}),
        }));

      const keys = result.buckets.map((bucket) => bucket.key);
      const labels =
        resolved.groupBy === "status" && widget.projectId
          ? await resolveStatusKeys(widget.projectId)
          : await resolveKeys(resolved.groupBy, keys);

      payload.push({
        id: widget.id,
        data: { ...result, labels },
      });
    } catch (error) {
      // Solo suben los mensajes que estan escritos para leerse: el de un filtro
      // que nombra un campo inexistente dice **cual**, que es justo lo que hace
      // falta para arreglar el widget. Cualquier otro se queda dentro.
      //
      // Un `DrizzleQueryError` lleva la consulta entera y sus parametros en el
      // mensaje, asi que devolverlo tal cual publicaba el SQL del producto —y
      // los valores del filtro— a quien mira el panel. Se registra en el
      // servidor y al cliente le llega una frase.
      const speakable =
        error instanceof HTTPException || error instanceof FilterError;

      if (!speakable) {
        log.error(
          `[dashboard] widget ${widget.id} (${widget.type}) failed`,
          error,
        );
      }

      payload.push({
        id: widget.id,
        error: speakable
          ? (error as Error).message
          : "This widget could not be computed",
      });
    }
  }

  return { widgets: payload };
}
