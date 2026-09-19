import {
  and,
  asc,
  desc,
  eq,
  gte,
  isNotNull,
  isNull,
  lt,
  ne,
  type SQL,
  sql,
} from "drizzle-orm";
import db from "../database";
import {
  projectTable,
  taskEpicTable,
  taskTable,
  timeEntryTable,
} from "../database/schema";
import { type PersonalScope, personalScopeCondition } from "../my-work/scope";
import { addDays, startOfServerDay } from "../utils/day-boundaries";
import {
  type FieldRegistry,
  priorityRankExpression,
} from "../view/field-registry";
import { type FilterNode, filterToSql } from "../view/filter-to-sql";

export const CATEGORICAL_GROUP_BY = [
  "project",
  "assignee",
  "priority",
  "team",
  "status",
  "done",
  "dueWindow",
  "epic",
] as const;

export const GRANULARITIES = ["day", "week", "month"] as const;

export const WIDGET_METRICS = [
  "count",
  "doneCount",
  "doneRatio",
  "sumEstimate",
  "sumLogged",
] as const;

export type CategoricalGroupBy = (typeof CATEGORICAL_GROUP_BY)[number];
export type Granularity = (typeof GRANULARITIES)[number];
export type WidgetMetric = (typeof WIDGET_METRICS)[number];

/** Cuantos cubos devuelve una agrupacion categorica antes de recortar. */
export const MAX_BUCKETS = 50;

/**
 * Cuantas claves distintas se traen antes de resumir.
 *
 * No es el numero de cubos que se pintan —eso es `MAX_BUCKETS`, y lo que sobra
 * se suma en "otros"—: es la valla contra una agrupacion cuya cardinalidad nadie
 * previo. Las que hay hoy estan acotadas por la configuracion del espacio, asi
 * que este tope no deberia tocarse nunca.
 */
const MAX_KEYS = 2_000;
/** Y cuantos una serie temporal, que es lo que decide si la grafica se lee. */
export const MAX_TIME_BUCKETS = 90;

export type AggregateBucket = {
  /** Opaca: un id, un slug o un cubo. Las etiquetas las pone `resolve-keys`. */
  key: string | null;
  value: number;
  /** Solo en `doneRatio`, donde el widget necesita el denominador. */
  total?: number;
};

export type AggregateResult = {
  buckets: AggregateBucket[];
  truncated: boolean;
};

export type AggregateRequest = {
  workspaceId: string;
  /** Quien mira, para los ambitos personales. */
  userId: string;
  /** Acota a lo asignado a esa persona o a lo de sus equipos. */
  scope?: PersonalScope;
  /** Nulo para mirar todo el espacio de trabajo. */
  projectId?: string | null;
  filter: FilterNode | null;
  registry: FieldRegistry;
  metric: WidgetMetric;
  /** Sin agrupacion, el resultado es un solo cubo con clave nula. */
  groupBy?: CategoricalGroupBy | "time";
  granularity?: Granularity;
  from?: Date;
  to?: Date;
  now?: Date;
};

/**
 * El ambito, que es lo mismo para los seis tipos de widget.
 *
 * **`project.workspace_id` va siempre, incluso con `projectId` puesto.** Es lo
 * que impide que un widget que apunte a un proyecto de otro espacio se lleve
 * datos ajenos: con la pertenencia comprobada aqui, un id equivocado devuelve
 * cero filas en vez de contenido de otro sitio.
 */
async function scopeConditions({
  workspaceId,
  userId,
  projectId,
  scope,
  filter,
  registry,
}: Pick<
  AggregateRequest,
  "workspaceId" | "userId" | "projectId" | "scope" | "filter" | "registry"
>): Promise<SQL[] | null> {
  const conditions: SQL[] = [
    eq(projectTable.workspaceId, workspaceId),
    isNull(projectTable.archivedAt),
    // Una tarea archivada no entra en ningun agregado: es la regla que ya
    // aplican los agregados del arbol.
    ne(taskTable.status, "archived"),
  ];

  if (projectId) {
    conditions.push(eq(taskTable.projectId, projectId));
  }

  if (scope) {
    const personal = await personalScopeCondition(scope, workspaceId, userId);
    // `null` es "no puede casar nada" —quien no esta en ningun equipo—, no
    // "sin filtro": devolverlo como ausencia contaria el espacio entero.
    if (!personal) return null;
    conditions.push(personal);
  }

  const compiled = filterToSql(filter, registry);
  if (compiled) {
    conditions.push(compiled);
  }

  return conditions;
}

const doneExpression = sql`(${taskTable.completedAt} IS NOT NULL)`;

/** El `CASE` de las ventanas de vencimiento, con las fronteras del servidor. */
function dueWindowExpression(now: Date): SQL {
  const today = startOfServerDay(now);
  const tomorrow = addDays(today, 1);
  const nextWeek = addDays(today, 7);

  return sql`CASE
    WHEN ${taskTable.dueDate} IS NULL THEN 'none'
    WHEN ${taskTable.dueDate} < ${today} THEN 'overdue'
    WHEN ${taskTable.dueDate} < ${tomorrow} THEN 'today'
    WHEN ${taskTable.dueDate} < ${nextWeek} THEN 'week'
    ELSE 'later'
  END`;
}

function categoricalKey(groupBy: CategoricalGroupBy, now: Date): SQL {
  switch (groupBy) {
    case "project":
      return sql`${taskTable.projectId}`;
    // Por `task.user_id` y no por `task_assignee`: aquella tabla multiplica las
    // tareas con varios responsables, asi que los cubos sumarian de mas.
    case "assignee":
      return sql`${taskTable.userId}`;
    case "priority":
      return sql`${taskTable.priority}`;
    case "team":
      return sql`${taskTable.teamId}`;
    case "status":
      return sql`${taskTable.status}`;
    case "done":
      return doneExpression;
    case "dueWindow":
      return dueWindowExpression(now);
    case "epic":
      return sql`${taskEpicTable.epicId}`;
  }
}

function timeKey(column: SQL, granularity: Granularity): SQL {
  // Devuelto como texto a proposito: una fecha cruda la leen drizzle y
  // node-postgres con convenios distintos —UTC frente a la zona local— y las
  // dos discrepan, que es lo que documenta `tree-aggregates.ts`.
  return sql`date_trunc(${granularity}, ${column})::text`;
}

function toNumber(value: unknown): number {
  // `::bigint` vuelve como cadena de node-postgres. Sin esto, Recharts recibe
  // "1234567" y no dibuja nada.
  return typeof value === "string" ? Number(value) : Number(value ?? 0);
}

export default async function aggregate(
  request: AggregateRequest,
): Promise<AggregateResult> {
  const now = request.now ?? new Date();
  const conditions = await scopeConditions(request);

  if (!conditions) return { buckets: [], truncated: false };
  const { metric, groupBy, granularity = "week" } = request;

  // La metrica elige la relacion base, y no es cosmetico: con la union de
  // `time_entry` puesta, un `count(*)` contaria una tarea una vez por entrada
  // de tiempo. Con `epic` pasa lo mismo con la pertenencia.
  if (metric === "sumLogged") {
    return aggregateLoggedTime({ ...request, now, conditions, granularity });
  }

  if (groupBy === "epic") {
    return aggregateByEpic({ ...request, conditions });
  }

  const key =
    groupBy === "time"
      ? timeKey(sql`${taskTable.completedAt}`, granularity)
      : groupBy
        ? categoricalKey(groupBy, now)
        : null;

  // La tendencia se dibuja sobre `completed_at`, asi que las filas sin cerrar no
  // tienen cubo al que ir.
  if (groupBy === "time") {
    conditions.push(isNotNull(taskTable.completedAt));
  }

  // `from`/`to` son **una ventana de cierre**, no de creacion, y valen agrupe o
  // no: es lo que deja que un resultado clave pregunte "cuantas se cerraron en
  // este trimestre" con el mismo agregado que dibuja la tendencia, en vez de una
  // segunda capa que mantener en paralelo.
  if (request.from) conditions.push(gte(taskTable.completedAt, request.from));
  if (request.to) conditions.push(lt(taskTable.completedAt, request.to));

  const value =
    metric === "sumEstimate"
      ? sql<number>`COALESCE(SUM(${taskTable.estimate}), 0)::bigint`
      : metric === "doneCount" || metric === "doneRatio"
        ? // En `doneRatio` el valor es lo hecho y `total` el denominador; sin
          // esta rama las dos cifras salian iguales y la barra siempre llena.
          sql<number>`COUNT(*) FILTER (WHERE ${taskTable.completedAt} IS NOT NULL)::int`
        : sql<number>`COUNT(*)::int`;

  const rows = await db
    .select({
      key: key ? sql<string | null>`${key}::text` : sql<null>`NULL`,
      value,
      total: sql<number>`COUNT(*)::int`,
    })
    .from(taskTable)
    .innerJoin(projectTable, eq(taskTable.projectId, projectTable.id))
    .where(and(...conditions))
    .groupBy(...groupByFor(groupBy, key))
    .orderBy(...orderFor(groupBy, key))
    // Sin tope para las categoricas: el `GROUP BY` devuelve una fila por
    // clave distinta —proyectos, personas, equipos, columnas, cinco
    // prioridades—, que esta acotado por la configuracion del espacio y no por
    // el tamano de la tabla. Traerlas todas es lo que permite sumar la cola en
    // un cubo "otros" en vez de cortarla en silencio. El barrido, que es lo
    // caro, se paga igual.
    // Un numero grande y no "sin tope": es una valla contra una cardinalidad
    // que nadie ha previsto, no el corte del reparto —ese lo hace `toResult`
    // sumando la cola—.
    .limit(groupBy === "time" ? MAX_TIME_BUCKETS + 1 : MAX_KEYS);

  return toResult(rows, metric, groupBy);
}

/**
 * Las claves con parametros se agrupan por **ordinal**, no repitiendo la
 * expresion.
 *
 * Drizzle vuelve a enlazar los parametros cada vez que se interpola el mismo
 * `SQL`, asi que la copia del `GROUP BY` sale con `$6, $7, $8` donde el `SELECT`
 * tenia `$1, $2, $3`. Postgres compara las dos expresiones nodo a nodo, dos
 * `Param` con distinto numero no son iguales, y la consulta muere con "column
 * task.due_date must appear in the GROUP BY clause". Solo pasa con las dos
 * claves que llevan parametros —la ventana de vencimiento y el `date_trunc` de
 * la tendencia—; las demas son columnas desnudas y se repiten identicas.
 *
 * El ordinal apunta a la primera columna del `SELECT`, que es siempre la clave.
 * No se usa en todos los casos a proposito: agrupar `priority` por ordinal
 * agruparia por `priority::text`, y entonces el `CASE` que ordena por rango
 * —que lee la columna cruda— dejaria de ser una expresion de algo agrupado.
 */
const PARAMETERIZED_KEYS = new Set(["dueWindow", "time"]);

function groupByFor(
  groupBy: AggregateRequest["groupBy"],
  key: SQL | null,
): SQL[] {
  if (!key) return [];
  if (groupBy && PARAMETERIZED_KEYS.has(groupBy)) return [sql`1`];
  return [key];
}

function orderFor(
  groupBy: AggregateRequest["groupBy"],
  key: SQL | null,
): SQL[] {
  if (!key) return [];
  // Mismo motivo que arriba: ordenar repitiendo la expresion la vuelve a
  // enlazar y deja de casar con lo agrupado.
  if (groupBy === "time") return [asc(sql`1`)];
  // La prioridad se ordena por su rango y no por su nombre, que alfabeticamente
  // pondria "urgent" detras de "low".
  if (groupBy === "priority") return [desc(priorityRankExpression)];
  return [desc(sql`COUNT(*)`)];
}

function bucketCap(groupBy: NonNullable<AggregateRequest["groupBy"]>): number {
  return groupBy === "time" ? MAX_TIME_BUCKETS : MAX_BUCKETS;
}

/**
 * La clave del cubo que recoge la cola de un reparto de alta cardinalidad.
 *
 * Se reconoce por su forma —dos guiones bajos— y no por un valor que pudiera
 * chocar con un id real.
 */
export const OTHER_BUCKET_KEY = "__other__";

function toResult(
  rows: Array<{ key: string | null; value: unknown; total: unknown }>,
  metric: WidgetMetric,
  groupBy: AggregateRequest["groupBy"],
): AggregateResult {
  const withTotal = metric === "doneRatio";

  const bucket = (row: (typeof rows)[number]) => ({
    key: row.key,
    value: toNumber(row.value),
    // El denominador solo lo necesita el que dibuja una proporcion.
    ...(withTotal ? { total: toNumber(row.total) } : {}),
  });

  if (!groupBy) return { buckets: rows.map(bucket), truncated: false };

  const cap = bucketCap(groupBy);
  if (rows.length <= cap)
    return { buckets: rows.map(bucket), truncated: false };

  // La cola no se tira: se suma. Cortar en el cubo 50 hacia que una tarta con
  // sesenta proyectos no sumara el total y nadie supiera por que.
  //
  // La tendencia es la excepcion: sus cubos son tramos de tiempo consecutivos y
  // agrupar "el resto de semanas" en una sola no significa nada. Ahi si se
  // corta, y el tope ya lo aplica la consulta.
  if (groupBy === "time") {
    return { buckets: rows.slice(0, cap).map(bucket), truncated: true };
  }

  const head = rows.slice(0, cap - 1).map(bucket);
  const tail = rows.slice(cap - 1);

  const other = {
    key: OTHER_BUCKET_KEY,
    value: tail.reduce((sum, row) => sum + toNumber(row.value), 0),
    ...(withTotal
      ? { total: tail.reduce((sum, row) => sum + toNumber(row.total), 0) }
      : {}),
  };

  return { buckets: [...head, other], truncated: true };
}

/**
 * Tiempo registrado. La base es `time_entry`, no `task`.
 *
 * `task` se une **sin alias**: todo lo que emite `filterToSql` interpola la
 * tabla y sale como `"task"."x"`, asi que aliasarla generaria SQL que
 * referencia una tabla que no esta en el `FROM`.
 */
async function aggregateLoggedTime({
  conditions,
  groupBy,
  granularity,
  from,
  to,
}: AggregateRequest & {
  conditions: SQL[];
  granularity: Granularity;
}): Promise<AggregateResult> {
  const scoped = [...conditions];

  // Solo entradas cerradas: una en marcha tiene duracion 0 y saltaria al
  // pararla, que en una medicion es ruido.
  scoped.push(isNotNull(timeEntryTable.endTime));
  if (from) scoped.push(gte(timeEntryTable.startTime, from));
  if (to) scoped.push(lt(timeEntryTable.startTime, to));

  const key =
    groupBy === "time"
      ? timeKey(sql`${timeEntryTable.startTime}`, granularity)
      : groupBy === "project"
        ? sql`${taskTable.projectId}`
        : sql`${timeEntryTable.userId}`;

  const rows = await db
    .select({
      key: sql<string | null>`${key}::text`,
      value: sql<number>`COALESCE(SUM(${timeEntryTable.duration}), 0)::bigint`,
      total: sql<number>`COUNT(*)::int`,
    })
    .from(timeEntryTable)
    .innerJoin(taskTable, eq(taskTable.id, timeEntryTable.taskId))
    .innerJoin(projectTable, eq(projectTable.id, taskTable.projectId))
    .where(and(...scoped))
    // Por ordinal cuando la clave lleva parametros, como en `aggregate()`:
    // repetir el `date_trunc` en el GROUP BY lo volvia a enlazar y la consulta
    // moria con "must appear in the GROUP BY clause".
    .groupBy(...groupByFor(groupBy, key))
    .orderBy(
      groupBy === "time"
        ? asc(sql`1`)
        : desc(sql`COALESCE(SUM(${timeEntryTable.duration}), 0)`),
    )
    .limit(bucketCap(groupBy ?? "assignee") + 1);

  return toResult(rows, "sumLogged", groupBy ?? "assignee");
}

/**
 * Avance por epica. La base es `task_epic`, cuyo grano es la pertenencia.
 *
 * Una tarea en dos epicas cuenta en las dos, asi que **los cubos suman por
 * encima del total de tareas**. Es correcto y es la razon de que este widget
 * devuelva tambien `total`: la proporcion se calcula dentro de cada cubo, y la
 * tarta que lo dibuje saca su 100 % de la suma de los cubos, nunca de un total
 * pedido aparte.
 */
async function aggregateByEpic({
  conditions,
}: AggregateRequest & { conditions: SQL[] }): Promise<AggregateResult> {
  const rows = await db
    .select({
      key: sql<string | null>`${taskEpicTable.epicId}::text`,
      value: sql<number>`COUNT(*) FILTER (WHERE ${taskTable.completedAt} IS NOT NULL)::int`,
      total: sql<number>`COUNT(*)::int`,
    })
    .from(taskEpicTable)
    .innerJoin(taskTable, eq(taskTable.id, taskEpicTable.taskId))
    .innerJoin(projectTable, eq(projectTable.id, taskTable.projectId))
    .where(and(...conditions))
    .groupBy(sql`${taskEpicTable.epicId}`)
    .orderBy(desc(sql`COUNT(*)`))
    .limit(MAX_BUCKETS + 1);

  return toResult(rows, "doneRatio", "epic");
}
