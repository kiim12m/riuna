import { and, asc, eq, type SQL, sql } from "drizzle-orm";
import db from "../database";
import { columnTable, taskTable } from "../database/schema";
import { getFieldDefinitionsForProject } from "../field/controllers/get-field-definitions";
import { getProjectWorkspaceId } from "../utils/assert-assignable-user";
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
  /**
   * La suma de cada campo personalizado numerico o de moneda sobre la rama,
   * incluida la propia tarea, por clave del campo. Una clave sin ningun valor
   * en la rama no aparece. Un "Presupuesto" de la obra entera.
   */
  fieldSums: Record<string, number>;
  /**
   * Para el progreso ponderado (ADR 083), solo de los descendientes: cuantos
   * estan estimados y su suma, lo mismo de los hechos, y cuantos son hitos,
   * que no pesan.
   */
  estimatedCount: number;
  estimatedSum: number;
  doneEstimatedCount: number;
  doneEstimatedSum: number;
  milestoneCount: number;
  doneMilestoneCount: number;
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
  estimated_count: number | string;
  estimated_sum: number | string;
  done_estimated_count: number | string;
  done_estimated_sum: number | string;
  milestone_count: number | string;
  done_milestone_count: number | string;
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

/**
 * Las claves de los campos que se pueden sumar: numericos y de moneda, vigentes
 * (los archivados se esconden de los formularios y tambien de las sumas). El
 * valor vive en el JSONB, asi que la clave es lo que se suma.
 */
async function getSummableFieldKeys(projectId: string): Promise<string[]> {
  const workspaceId = await getProjectWorkspaceId(projectId);
  const definitions = await getFieldDefinitionsForProject(
    workspaceId,
    projectId,
  );
  return definitions
    .filter(
      (definition) =>
        definition.type === "number" || definition.type === "currency",
    )
    .map((definition) => definition.key);
}

type FieldSumRow = { task_id: string; key: string; total: number | string };

function toFieldSums(rows: FieldSumRow[]) {
  const byTask = new Map<string, Record<string, number>>();
  for (const row of rows) {
    const sums = byTask.get(row.task_id) ?? {};
    sums[row.key] = toNumber(row.total);
    byTask.set(row.task_id, sums);
  }
  return byTask;
}

/**
 * Las cifras del progreso ponderado (ADR 083), solo sobre los descendientes
 * —`d.id <> ancestro`—: la propia tarea no cuenta en su progreso.
 */
function weightedColumns(ancestor: SQL, finalStatusList: SQL) {
  const descendant = sql`d."id" <> ${ancestor}`;
  const done = sql`d."status" IN (${finalStatusList})`;
  return sql`
      COUNT(*) FILTER (
        WHERE ${descendant} AND d."estimate" IS NOT NULL AND NOT d."is_milestone"
      )::int AS estimated_count,
      COALESCE(SUM(d."estimate") FILTER (
        WHERE ${descendant} AND NOT d."is_milestone"
      ), 0)::bigint AS estimated_sum,
      COUNT(*) FILTER (
        WHERE ${descendant} AND ${done} AND d."estimate" IS NOT NULL
          AND NOT d."is_milestone"
      )::int AS done_estimated_count,
      COALESCE(SUM(d."estimate") FILTER (
        WHERE ${descendant} AND ${done} AND NOT d."is_milestone"
      ), 0)::bigint AS done_estimated_sum,
      COUNT(*) FILTER (WHERE ${descendant} AND d."is_milestone")::int
        AS milestone_count,
      COUNT(*) FILTER (
        WHERE ${descendant} AND ${done} AND d."is_milestone"
      )::int AS done_milestone_count`;
}

function weightedFields(row: AggregateRow) {
  return {
    estimatedCount: toNumber(row.estimated_count),
    estimatedSum: toNumber(row.estimated_sum),
    doneEstimatedCount: toNumber(row.done_estimated_count),
    doneEstimatedSum: toNumber(row.done_estimated_sum),
    milestoneCount: toNumber(row.milestone_count),
    doneMilestoneCount: toNumber(row.done_milestone_count),
  };
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
      COALESCE(SUM(tt.logged), 0)::bigint AS logged_sum,
      ${weightedColumns(sql`ancestor.id`, finalStatusList)}
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

  // Las sumas de campos van en una segunda consulta, solo si el proyecto tiene
  // algun campo sumable: meterlas en la primera multiplicaria sus filas por el
  // numero de campos y falsearia los recuentos. Mismo truco de los segmentos de
  // `path` para encontrar a los ancestros.
  const summable = await getSummableFieldKeys(projectId);
  const fieldSums =
    summable.length > 0
      ? toFieldSums(
          (
            await db.execute<FieldSumRow>(sql`
              SELECT ancestor.id AS task_id, k.key AS key,
                SUM((d."custom_fields" ->> k.key)::numeric) AS total
              FROM "task" d
              CROSS JOIN LATERAL unnest(
                string_to_array(trim(both '/' from d."path"), '/')
              ) AS ancestor(id)
              CROSS JOIN unnest(${sql.param(summable)}::text[]) AS k(key)
              WHERE d."project_id" = ${projectId}
                AND (d."id" = ancestor.id OR d."status" <> 'archived')
                AND jsonb_typeof(d."custom_fields" -> k.key) = 'number'
                ${
                  onlyFor
                    ? sql`AND ancestor.id = ANY(${sql.param(onlyFor)}::text[])`
                    : sql``
                }
              GROUP BY ancestor.id, k.key
            `)
          ).rows,
        )
      : new Map<string, Record<string, number>>();

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
      fieldSums: fieldSums.get(row.task_id) ?? {},
      ...weightedFields(row),
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
      COALESCE(SUM(tt.logged), 0)::bigint AS logged_sum,
      ${weightedColumns(sql`${taskId}`, finalStatusList)}
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

  const summable = await getSummableFieldKeys(projectId);
  const sums =
    summable.length > 0
      ? toFieldSums(
          (
            await db.execute<FieldSumRow>(sql`
              SELECT ${taskId} AS task_id, k.key AS key,
                SUM((d."custom_fields" ->> k.key)::numeric) AS total
              FROM "task" d
              CROSS JOIN unnest(${sql.param(summable)}::text[]) AS k(key)
              WHERE d."project_id" = ${projectId}
                AND d."path" LIKE ${subtreePattern(task.path)}
                AND (d."id" = ${taskId} OR d."status" <> 'archived')
                AND jsonb_typeof(d."custom_fields" -> k.key) = 'number'
              GROUP BY k.key
            `)
          ).rows,
        ).get(taskId)
      : undefined;

  return {
    childCount: toNumber(row.child_count),
    descendantCount: toNumber(row.descendant_count),
    descendantDoneCount: toNumber(row.descendant_done_count),
    startDate: toDate(row.subtree_start_date),
    dueDate: toDate(row.subtree_due_date),
    estimateSeconds: toNumber(row.estimate_sum),
    loggedSeconds: toNumber(row.logged_sum),
    fieldSums: sums ?? {},
    ...weightedFields(row),
  };
}

/**
 * Forma con la que viaja el agregado al cliente. Se calcula aqui y no en la
 * interfaz para que las cuatro vistas cuenten lo mismo.
 */
export function serializeAggregate(
  aggregate: TaskSubtreeAggregate | undefined,
  own: { startDate: Date | null; dueDate: Date | null },
  /** El ajuste de jerarquia del proyecto (ADR 083). */
  weighted = false,
) {
  if (!aggregate) return null;

  const { descendantCount, descendantDoneCount } = aggregate;

  return {
    childCount: aggregate.childCount,
    descendantCount,
    descendantDoneCount,
    progress: branchProgress(aggregate, weighted),
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
    fieldSums: aggregate.fieldSums,
  };
}

export type SerializedSubtreeAggregate = ReturnType<typeof serializeAggregate>;

/**
 * El progreso de una rama, en porcentaje. Contando tareas hechas, o pesando
 * cada una por su estimacion (ADR 083): una sin estimar pesa la media de las
 * estimadas de la rama, y un hito no pesa. Sin ninguna estimacion que pesar,
 * se vuelve a contar tareas.
 */
export function branchProgress(
  aggregate: Pick<
    TaskSubtreeAggregate,
    | "descendantCount"
    | "descendantDoneCount"
    | "estimatedCount"
    | "estimatedSum"
    | "doneEstimatedCount"
    | "doneEstimatedSum"
    | "milestoneCount"
    | "doneMilestoneCount"
  >,
  weighted: boolean,
): number {
  const { descendantCount, descendantDoneCount } = aggregate;
  if (descendantCount === 0) return 0;
  const counted = Math.round((descendantDoneCount / descendantCount) * 100);
  if (!weighted || aggregate.estimatedCount === 0) return counted;

  const average = aggregate.estimatedSum / aggregate.estimatedCount;
  const unestimated =
    descendantCount - aggregate.estimatedCount - aggregate.milestoneCount;
  const doneUnestimated =
    descendantDoneCount -
    aggregate.doneEstimatedCount -
    aggregate.doneMilestoneCount;
  const total = aggregate.estimatedSum + average * unestimated;
  if (total <= 0) return counted;
  return Math.round(
    ((aggregate.doneEstimatedSum + average * doneUnestimated) / total) * 100,
  );
}
