import { and, asc, eq, sql } from "drizzle-orm";
import db from "../database";
import { columnTable, taskTable } from "../database/schema";
import { subtreePattern } from "./tree";

// Agregados del subarbol: lo que un padre resume de su rama. Se calculan al
// leer, con una sola consulta por proyecto que se apoya en el `path`
// materializado en vez de recorrer el arbol con una recursiva por tarea.
//
// Regla unica sobre lo archivado: **una tarea archivada no entra en ningun
// agregado**. Ni cuenta para el progreso, ni suma estimacion, ni suma tiempo.
// Archivar es sacar del computo, y aplicar la misma regla a las cuatro cifras
// evita tener que recordar cual era la excepcion.

export type TaskSubtreeAggregate = {
  /** Hijas directas, sin nietas. Es el contador de las tarjetas. */
  childCount: number;
  /** Descendientes a cualquier profundidad, sin archivadas. */
  descendantCount: number;
  /** De esos descendientes, los que estan en una columna final. */
  descendantDoneCount: number;
  /** Fecha de inicio mas temprana de la rama, incluida la propia tarea. */
  startDate: Date | null;
  /** Fecha de entrega mas tardia de la rama, incluida la propia tarea. */
  dueDate: Date | null;
  /** Estimacion sumada de la rama en segundos, incluida la propia tarea. */
  estimateSeconds: number;
  /** Tiempo registrado sumado de la rama en segundos, incluida la propia. */
  loggedSeconds: number;
};

export type TaskSubtreeAggregates = Map<string, TaskSubtreeAggregate>;

type AggregateRow = {
  task_id: string;
  child_count: number | string;
  descendant_count: number | string;
  descendant_done_count: number | string;
  subtree_start_date: string | null;
  subtree_due_date: string | null;
  estimate_sum: number | string;
  logged_sum: number | string;
};

function toNumber(value: number | string | null): number {
  return typeof value === "number" ? value : Number(value ?? 0);
}

/**
 * Las fechas de esta consulta llegan como texto a proposito. `timestamp` no
 * lleva zona, y node-postgres lo interpretaria en hora local mientras que
 * drizzle lo interpreta en UTC: dejarlo asi haria que el agregado de una rama
 * y la fecha de la propia tarea, leidas de la misma columna, no coincidieran.
 * Se pide el valor en texto y se fija el criterio de drizzle.
 */
function toDate(value: Date | string | null): Date | null {
  if (value == null) return null;
  if (value instanceof Date) return value;
  return new Date(`${value.replace(" ", "T")}Z`);
}

async function getFinalStatuses(projectId: string): Promise<string[]> {
  const columns = await db
    .select({ slug: columnTable.slug, isFinal: columnTable.isFinal })
    .from(columnTable)
    .where(eq(columnTable.projectId, projectId))
    .orderBy(asc(columnTable.position));

  const finals = columns.filter((c) => c.isFinal).map((c) => c.slug);
  // Un proyecto heredado sin columnas marcadas como finales seguiria usando el
  // slug `done` de Kaneo; sin este respaldo el progreso saldria siempre a cero.
  return finals.length > 0 ? finals : ["done"];
}

/**
 * Agregados de todas las tareas del proyecto que tengan al menos una hija.
 * Las hojas no aparecen en el mapa: no tienen nada que resumir, y excluirlas
 * es lo que mantiene el coste proporcional a los padres y no a las tareas.
 */
export async function getProjectSubtreeAggregates(
  projectId: string,
  /**
   * Para que tareas hacen falta. Sin esto se calculan las de todo el proyecto
   * aunque la peticion solo devuelva una pagina: medido con 50.000 tareas, eran
   * 242 ms fijos por peticion, el 85 % de una respuesta paginada.
   *
   * Acota el lado de los **ancestros**, no el de los descendientes: el agregado
   * de una tarea sigue mirando su rama entera, que es lo que resume.
   */
  onlyFor?: string[],
): Promise<TaskSubtreeAggregates> {
  if (onlyFor && onlyFor.length === 0) return new Map();

  const finalStatuses = await getFinalStatuses(projectId);
  const finalStatusList = sql.join(
    finalStatuses.map((status) => sql`${status}`),
    sql`, `,
  );

  const result = await db.execute<AggregateRow>(sql`
    WITH task_time AS (
      SELECT te."task_id" AS task_id, COALESCE(SUM(te."duration"), 0) AS logged
      FROM "time_entry" te
      JOIN "task" t ON t."id" = te."task_id"
      WHERE t."project_id" = ${projectId}
      GROUP BY te."task_id"
    )
    SELECT
      ancestor.id AS task_id,
      COUNT(*) FILTER (WHERE d."parent_id" = ancestor.id)::int AS child_count,
      COUNT(*) FILTER (WHERE d."id" <> ancestor.id)::int AS descendant_count,
      COUNT(*) FILTER (
        WHERE d."id" <> ancestor.id AND d."status" IN (${finalStatusList})
      )::int AS descendant_done_count,
      MIN(d."start_date")::text AS subtree_start_date,
      MAX(d."due_date")::text AS subtree_due_date,
      COALESCE(SUM(d."estimate"), 0)::bigint AS estimate_sum,
      COALESCE(SUM(tt.logged), 0)::bigint AS logged_sum
    FROM "task" d
    -- Cada tarea aporta a la cuenta de cada uno de sus ancestros, y sus
    -- ancestros son exactamente los segmentos de su propio path: para
    -- /a/b/c/, los ids a, b y c. Los ids son unicos, asi que la
    -- correspondencia con "a.path es prefijo de d.path" es exacta.
    CROSS JOIN LATERAL unnest(
      string_to_array(trim(both '/' from d."path"), '/')
    ) AS ancestor(id)
    LEFT JOIN task_time tt ON tt.task_id = d."id"
    WHERE d."project_id" = ${projectId}
      AND (d."id" = ancestor.id OR d."status" <> 'archived')
      ${
        onlyFor
          ? sql`AND ancestor.id = ANY(${sql.param(onlyFor)}::text[])`
          : sql``
      }
    GROUP BY ancestor.id
    -- Equivale al EXISTS (... c.parent_id = a.id) de antes —solo las tareas
    -- que tienen hijas— pero sin una subconsulta por fila.
    HAVING COUNT(*) FILTER (WHERE d."parent_id" = ancestor.id) > 0
  `);

  const aggregates: TaskSubtreeAggregates = new Map();

  for (const row of result.rows) {
    aggregates.set(row.task_id, {
      childCount: toNumber(row.child_count),
      descendantCount: toNumber(row.descendant_count),
      descendantDoneCount: toNumber(row.descendant_done_count),
      startDate: toDate(row.subtree_start_date),
      dueDate: toDate(row.subtree_due_date),
      estimateSeconds: toNumber(row.estimate_sum),
      loggedSeconds: toNumber(row.logged_sum),
    });
  }

  return aggregates;
}

/**
 * Agregado de una sola tarea, para el detalle.
 *
 * Consulta **solo su subarbol**, con un patron `LIKE` constante que si puede
 * usar `task_path_idx`. Antes delegaba en la version de proyecto entero, asi
 * que abrir una tarea pagaba el coste de calcular los agregados de todas las
 * demas: con 10.000 tareas en el proyecto, casi siete segundos para devolver
 * una fila.
 */
export async function getTaskSubtreeAggregate(
  projectId: string,
  taskId: string,
): Promise<TaskSubtreeAggregate | null> {
  const [task] = await db
    .select({ path: taskTable.path })
    .from(taskTable)
    .where(and(eq(taskTable.projectId, projectId), eq(taskTable.id, taskId)))
    .limit(1);

  if (!task) return null;

  const finalStatuses = await getFinalStatuses(projectId);
  const finalStatusList = sql.join(
    finalStatuses.map((status) => sql`${status}`),
    sql`, `,
  );

  const result = await db.execute<AggregateRow>(sql`
    SELECT
      ${taskId} AS task_id,
      COUNT(*) FILTER (WHERE d."parent_id" = ${taskId})::int AS child_count,
      COUNT(*) FILTER (WHERE d."id" <> ${taskId})::int AS descendant_count,
      COUNT(*) FILTER (
        WHERE d."id" <> ${taskId} AND d."status" IN (${finalStatusList})
      )::int AS descendant_done_count,
      MIN(d."start_date")::text AS subtree_start_date,
      MAX(d."due_date")::text AS subtree_due_date,
      COALESCE(SUM(d."estimate"), 0)::bigint AS estimate_sum,
      COALESCE(SUM(tt.logged), 0)::bigint AS logged_sum
    FROM "task" d
    LEFT JOIN (
      SELECT te."task_id" AS task_id, COALESCE(SUM(te."duration"), 0) AS logged
      FROM "time_entry" te
      GROUP BY te."task_id"
    ) tt ON tt.task_id = d."id"
    WHERE d."project_id" = ${projectId}
      AND d."path" LIKE ${subtreePattern(task.path)}
      AND (d."id" = ${taskId} OR d."status" <> 'archived')
  `);

  const row = result.rows[0];

  // Sin hijas no hay nada que resumir, igual que en la version de proyecto.
  if (!row || toNumber(row.child_count) === 0) return null;

  return {
    childCount: toNumber(row.child_count),
    descendantCount: toNumber(row.descendant_count),
    descendantDoneCount: toNumber(row.descendant_done_count),
    startDate: toDate(row.subtree_start_date),
    dueDate: toDate(row.subtree_due_date),
    estimateSeconds: toNumber(row.estimate_sum),
    loggedSeconds: toNumber(row.logged_sum),
  };
}

/**
 * Forma con la que viaja el agregado al cliente. Se calcula aqui y no en la
 * interfaz para que las cuatro vistas cuenten lo mismo.
 */
export function serializeAggregate(
  aggregate: TaskSubtreeAggregate | undefined,
  own: { startDate: Date | null; dueDate: Date | null },
) {
  if (!aggregate) return null;

  const { descendantCount, descendantDoneCount } = aggregate;

  return {
    childCount: aggregate.childCount,
    descendantCount,
    descendantDoneCount,
    progress:
      descendantCount > 0
        ? Math.round((descendantDoneCount / descendantCount) * 100)
        : 0,
    // La fecha heredada solo se anuncia cuando amplia la propia: si el padre
    // ya abarca a sus hijas, repetir su fecha como "heredada" seria ruido.
    startDate: aggregate.startDate,
    dueDate: aggregate.dueDate,
    inheritsStartDate:
      aggregate.startDate != null &&
      (own.startDate == null || aggregate.startDate < own.startDate),
    inheritsDueDate:
      aggregate.dueDate != null &&
      (own.dueDate == null || aggregate.dueDate > own.dueDate),
    estimateSeconds: aggregate.estimateSeconds,
    loggedSeconds: aggregate.loggedSeconds,
  };
}

export type SerializedSubtreeAggregate = ReturnType<typeof serializeAggregate>;
