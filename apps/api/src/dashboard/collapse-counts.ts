import { and, eq, type SQL, sql } from "drizzle-orm";
import db from "../database";
import {
  type dashboardWidgetTable,
  projectTable,
  taskTable,
} from "../database/schema";
import { buildFilter } from "../view/build-filter";
import type { FieldRegistry } from "../view/field-registry";
import { filterToSql } from "../view/filter-to-sql";
import { workspaceTaskConditions } from "../view/workspace-task-query";
import type { AggregateResult } from "./aggregate";
import type { WidgetConfig } from "./widget-config";
import {
  completionRangePredicates,
  widgetPredicates,
} from "./widget-predicate";

type WidgetRow = typeof dashboardWidgetTable.$inferSelect;

/**
 * Las tarjetas de recuento de un panel, en **un** barrido por ambito.
 *
 * Es la palanca que la ADR 030 dejo escrita y sin construir —"colapsar widgets
 * en un solo barrido"— porque con seis widgets no hacia falta. Con una fila de
 * ocho cifras si: cada una por su cuenta es un barrido completo de la misma
 * tabla, con el mismo ambito, para cambiar solo el predicado.
 *
 * **El grupo se forma por ambito, no por filtro.** El filtro compilado de cada
 * widget entra dentro de su propio `FILTER (WHERE ...)`, que es exactamente lo
 * que permite que siete tarjetas con siete predicados distintos compartan un
 * barrido. `filterToSql` devuelve un predicado de fila, igual de valido en un
 * `FILTER` que en un `WHERE`.
 *
 * El problema de `PARAMETERIZED_KEYS` de `aggregate.ts` **no** aplica aqui: sin
 * `GROUP BY` ninguna expresion se interpola dos veces, asi que drizzle no
 * vuelve a enlazar parametros y no hace falta agrupar por ordinal.
 */
export default async function collapseCountWidgets({
  widgets,
  workspaceId,
  userId,
  now,
  weekStart,
  registryFor,
}: {
  widgets: WidgetRow[];
  workspaceId: string;
  userId: string;
  now: Date;
  /** El principio de la semana natural de quien mira, para `thisWeek`. */
  weekStart: Date;
  registryFor: (projectId: string | null) => Promise<FieldRegistry>;
}): Promise<Map<string, AggregateResult>> {
  const out = new Map<string, AggregateResult>();

  const groups = new Map<string, WidgetRow[]>();
  for (const widget of widgets) {
    if (!isCollapsible(widget)) continue;
    const config = widget.config as WidgetConfig;
    const key = `${widget.projectId ?? ""}|${config.scope ?? ""}`;
    const group = groups.get(key);
    if (group) group.push(widget);
    else groups.set(key, [widget]);
  }

  for (const group of groups.values()) {
    // Un grupo de uno es una segunda ruta para el caso comun sin ninguna
    // ventaja: se queda en la ruta en serie, que ya sabe hacerlo.
    if (group.length < 2) continue;

    const first = group[0];
    if (!first) continue;
    const projectId = first.projectId;
    const scope = (first.config as WidgetConfig).scope;
    const registry = await registryFor(projectId);

    const base = await workspaceTaskConditions({
      workspaceId,
      userId,
      projectId,
      scope,
      filter: null,
      registry,
    });

    // Sin equipos el ambito no casa nada. **Sin cubos**, que es literalmente lo
    // que devuelve la salida temprana de `aggregate()`: la tarjeta lee
    // `buckets[0]?.value ?? 0` y ensena 0 igual, pero la exportacion itera los
    // cubos y con uno falso sacaba una fila "Sin valor 0" que la ruta en serie
    // no saca. Las dos rutas tienen que devolver la misma forma, no solo la
    // misma cifra.
    if (!base) {
      for (const widget of group) {
        out.set(widget.id, { buckets: [], truncated: false });
      }
      continue;
    }

    // Cada filtro se compila por separado: uno que nombre un campo archivado
    // lanza `FilterError`, y en una consulta compartida eso se llevaria por
    // delante a todo el grupo en vez de a su widget. El que no compile se cae
    // del grupo y lo recoge la ruta en serie, con su propio mensaje de error.
    const eligible: Array<{ widget: WidgetRow; predicate: SQL }> = [];

    for (const widget of group) {
      const config = widget.config as WidgetConfig;
      try {
        const conditions: SQL[] = [
          ...widgetPredicates(config, now, weekStart),
          ...completionRangePredicates(config, now),
        ];
        const compiled = filterToSql(
          buildFilter(config.filter ?? []),
          registry,
        );
        if (compiled) conditions.push(compiled);

        eligible.push({
          widget,
          // Sin predicados propios la tarjeta cuenta todo el ambito.
          predicate: conditions.length
            ? (and(...conditions) as SQL)
            : sql`TRUE`,
        });
      } catch {
        // Lo recoge la ruta en serie.
      }
    }

    if (eligible.length < 2) continue;

    // Alias posicionales y no ids: un identificador de Postgres topa en 63
    // bytes y un cuid2 no dice nada al leer la consulta.
    const selection: Record<string, SQL<number>> = {};
    eligible.forEach(({ widget, predicate }, index) => {
      const metric = (widget.config as WidgetConfig).metric;
      selection[`w${index}`] =
        metric === "doneCount"
          ? sql<number>`COUNT(*) FILTER (WHERE ${predicate} AND ${taskTable.completedAt} IS NOT NULL)::int`
          : sql<number>`COUNT(*) FILTER (WHERE ${predicate})::int`;
    });

    const [row] = await db
      .select(selection)
      .from(taskTable)
      .innerJoin(projectTable, eq(taskTable.projectId, projectTable.id))
      .where(and(...base));

    eligible.forEach(({ widget }, index) => {
      const value = Number(row?.[`w${index}`] ?? 0);
      out.set(widget.id, { buckets: [{ key: null, value }], truncated: false });
    });
  }

  return out;
}

/**
 * Que tarjeta entra en el barrido compartido.
 *
 * `doneRatio` se queda fuera: necesita un denominador propio por widget, que
 * duplica la superficie por dos widgets heredados que la ruta en serie calcula
 * igual de bien.
 */
function isCollapsible(widget: WidgetRow): boolean {
  if (widget.type !== "count") return false;
  const config = widget.config as WidgetConfig;
  if (config.groupBy) return false;
  const metric = config.metric ?? "count";
  return metric === "count" || metric === "doneCount";
}
