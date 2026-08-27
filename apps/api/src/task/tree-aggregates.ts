import { asc, eq, sql } from "drizzle-orm";
import db from "../database";
import { columnTable } from "../database/schema";

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
): Promise<TaskSubtreeAggregates> {
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
      a."id" AS task_id,
      COUNT(*) FILTER (WHERE d."parent_id" = a."id")::int AS child_count,
      COUNT(*) FILTER (WHERE d."id" <> a."id")::int AS descendant_count,
      COUNT(*) FILTER (
        WHERE d."id" <> a."id" AND d."status" IN (${finalStatusList})
      )::int AS descendant_done_count,
      MIN(d."start_date")::text AS subtree_start_date,
      MAX(d."due_date")::text AS subtree_due_date,
      COALESCE(SUM(d."estimate"), 0)::bigint AS estimate_sum,
      COALESCE(SUM(tt.logged), 0)::bigint AS logged_sum
    FROM "task" a
    JOIN "task" d
      ON d."project_id" = a."project_id"
     AND d."path" LIKE a."path" || '%'
     AND (d."id" = a."id" OR d."status" <> 'archived')
    LEFT JOIN task_time tt ON tt.task_id = d."id"
    WHERE a."project_id" = ${projectId}
      AND EXISTS (SELECT 1 FROM "task" c WHERE c."parent_id" = a."id")
    GROUP BY a."id"
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

/** Agregado de una sola tarea, para el detalle. */
export async function getTaskSubtreeAggregate(
  projectId: string,
  taskId: string,
): Promise<TaskSubtreeAggregate | null> {
  const aggregates = await getProjectSubtreeAggregates(projectId);
  return aggregates.get(taskId) ?? null;
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
