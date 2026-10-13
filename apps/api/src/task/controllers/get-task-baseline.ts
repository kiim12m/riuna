import { getTableColumns, type SQL, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { taskTable } from "../../database/schema";
import {
  compileTaskFilter,
  type TaskListFilters,
  taskListWhere,
} from "../list-conditions";

/**
 * La linea base de una vista (ADR 085): que tareas cumplian su filtro en un
 * instante pasado, cuales lo cumplen ahora, y que cambio en las que siguen.
 *
 * El pasado se reconstruye desde `activity`: el primer cambio de cada campo
 * despues de ese instante guarda su valor de entonces, y sin cambios vale el
 * de ahora. Ese pasado se monta en una CTE llamada `task`, que sombrea la
 * tabla, y el filtro de la vista se compila contra ella con el motor de
 * siempre (ADR 014): la semantica es exactamente la de la barra de filtros.
 *
 * Limites, a sabiendas: las pertenencias (asignados, etiquetas, epicas,
 * observadores) se evaluan con su valor de ahora, `completed_at` solo sabe si
 * se completo despues, y lo que se cambio antes de que la actividad guardara
 * el valor anterior de un campo se da por igual que ahora.
 */

type FieldRule = {
  /** El campo, como lo agrupa la reconstruccion. */
  field: string;
  /** Tipos de actividad que lo cambian, y la clave con su valor anterior. */
  sources: Array<{ type: string; key: string }>;
  /** Como se lee ese valor anterior para la columna. */
  cast: (value: SQL) => SQL;
};

const asTimestamp = (value: SQL) =>
  sql`(${value})::timestamptz AT TIME ZONE 'UTC'`;
const asText = (value: SQL) => value;

/** Las columnas que se reconstruyen, por su nombre en la base. */
const RULES: Record<string, FieldRule> = {
  status: {
    field: "status",
    sources: [{ type: "status_changed", key: "oldStatus" }],
    cast: asText,
  },
  priority: {
    field: "priority",
    sources: [{ type: "priority_changed", key: "oldPriority" }],
    cast: asText,
  },
  due_date: {
    field: "due",
    sources: [{ type: "due_date_changed", key: "oldDueDate" }],
    cast: asTimestamp,
  },
  start_date: {
    field: "start",
    sources: [{ type: "start_date_changed", key: "oldStartDate" }],
    cast: asTimestamp,
  },
  title: {
    field: "title",
    sources: [{ type: "title_changed", key: "oldTitle" }],
    cast: asText,
  },
  estimate: {
    field: "estimate",
    sources: [{ type: "estimate_changed", key: "oldEstimate" }],
    cast: (value) => sql`(${value})::integer`,
  },
  parent_id: {
    field: "parent",
    sources: [{ type: "parent_changed", key: "oldParentId" }],
    cast: asText,
  },
  cycle_id: {
    field: "cycle",
    sources: [{ type: "cycle_changed", key: "oldCycleId" }],
    cast: asText,
  },
  team_id: {
    field: "team",
    sources: [
      { type: "team_changed", key: "oldTeamId" },
      { type: "team_unassigned", key: "oldTeamId" },
    ],
    cast: asText,
  },
  assignee_id: {
    field: "assignee",
    sources: [
      { type: "assignee_changed", key: "oldAssigneeId" },
      { type: "unassigned", key: "previousAssigneeId" },
    ],
    cast: asText,
  },
};

const FIELD_OF_TYPE = Object.values(RULES).flatMap((rule) =>
  rule.sources.map((source) => ({ ...source, field: rule.field })),
);

export type BaselineTask = {
  id: string;
  number: number | null;
  title: string;
  status: string;
  priority: string;
  userId: string | null;
  startDate: string | null;
  dueDate: string | null;
  estimate: number | null;
};

type Row = {
  id: string;
  number: number | null;
  title: string;
  status: string;
  priority: string;
  assignee_id: string | null;
  start_date: string | null;
  due_date: string | null;
  estimate: number | null;
  cur_title: string | null;
  cur_status: string | null;
  cur_priority: string | null;
  cur_assignee_id: string | null;
  cur_start_date: string | null;
  cur_due_date: string | null;
  cur_estimate: number | null;
  is_current: boolean;
};

// Los `timestamp` llegan como texto: es el valor UTC que guarda drizzle.
const toIso = (value: string | null) =>
  value ? new Date(`${value.replace(" ", "T")}Z`).toISOString() : null;

const DISPLAY: Array<[keyof BaselineTask, keyof Row, keyof Row]> = [
  ["title", "title", "cur_title"],
  ["status", "status", "cur_status"],
  ["priority", "priority", "cur_priority"],
  ["userId", "assignee_id", "cur_assignee_id"],
  ["startDate", "start_date", "cur_start_date"],
  ["dueDate", "due_date", "cur_due_date"],
  ["estimate", "estimate", "cur_estimate"],
];

function pastTask(row: Row): BaselineTask {
  return {
    id: row.id,
    number: row.number,
    title: row.title,
    status: row.status,
    priority: row.priority,
    userId: row.assignee_id,
    startDate: toIso(row.start_date),
    dueDate: toIso(row.due_date),
    estimate: row.estimate,
  };
}

export async function getTaskBaseline(
  projectId: string,
  at: Date,
  options: TaskListFilters,
) {
  if (at.getTime() >= Date.now()) {
    throw new HTTPException(400, {
      message: "The baseline must be in the past",
    });
  }
  const project = await db.query.projectTable.findFirst({
    where: (table, { eq }) => eq(table.id, projectId),
    columns: { workspaceId: true },
  });
  if (!project) throw new HTTPException(404, { message: "Project not found" });

  const atSql = sql`${at.toISOString().replace("T", " ").replace("Z", "")}::timestamp`;
  const where = await taskListWhere(projectId, project.workspaceId, options);

  // «Lo que casa, mas su rama» no se evalua contra el pasado con la forma de
  // la lista: sin estadisticas de la CTE, el planificador cree que lo que casa
  // son dos filas, cruza cada tarea con las tres mil que casaban de verdad en
  // un bucle anidado (33 millones de comparaciones, dos segundos) y no hay
  // forma de convencerlo. Aqui lo que casa se calcula una vez, y cada tarea
  // mira si alguno de los segmentos de su camino esta en ese conjunto: una
  // busqueda en un hash por ancestro, haga la estimacion lo que haga.
  const branch =
    options.treeScope === "withDescendants" && options.filter
      ? await compileTaskFilter(projectId, project.workspaceId, options.filter)
      : undefined;
  const pastWhere = branch
    ? await taskListWhere(projectId, project.workspaceId, {
        ...options,
        filter: null,
        treeScope: "matching",
      })
    : where;

  // El primer cambio de cada campo despues del instante: su valor anterior es
  // el de entonces. Los campos personalizados, uno por clave.
  const fieldCase = sql.join(
    FIELD_OF_TYPE.map((entry) => sql`WHEN ${entry.type} THEN ${entry.field}`),
    sql` `,
  );
  const keyCase = sql.join(
    FIELD_OF_TYPE.map((entry) => sql`WHEN ${entry.type} THEN ${entry.key}`),
    sql` `,
  );
  // De cada fila solo viaja el valor anterior, `{"v": ...}`, y nada si la
  // fila no lo guarda: con el `event_data` entero, la agregacion de dos meses
  // no cabia en memoria y se iba a disco.
  const firsts = sql`
    SELECT DISTINCT ON (a."task_id", f.field, COALESCE(a."event_data"->>'key', ''))
      a."task_id" AS task_id, f.field, a."event_data"->>'key' AS key,
      CASE
        WHEN f.field = 'custom' THEN
          CASE WHEN a."event_data"->>'hasValues' IS DISTINCT FROM 'false'
            THEN jsonb_build_object('v', a."event_data"->'from') END
        WHEN a."event_data" ? f.old_key THEN
          jsonb_build_object('v', a."event_data"->f.old_key)
      END AS old
    FROM "activity" a
    JOIN public."task" t ON t."id" = a."task_id"
    CROSS JOIN LATERAL (
      SELECT
        CASE a."type" ${fieldCase}
          WHEN 'custom_field_changed' THEN 'custom'
          WHEN 'milestone_changed' THEN 'milestone'
        END AS field,
        CASE a."type" ${keyCase}
          WHEN 'milestone_changed' THEN 'isMilestone'
        END AS old_key
    ) f
    WHERE t."project_id" = ${projectId}
      AND a."created_at" > ${atSql}
      AND f.field IS NOT NULL
    ORDER BY a."task_id", f.field, COALESCE(a."event_data"->>'key', ''),
      a."created_at" ASC`;

  // Cada columna reconstruida lee su primer cambio de `changes.fields`, una
  // sola fila por tarea: con una union por campo contra la CTE, el
  // planificador acababa en bucles anidados y una semana tardaba diez
  // segundos.
  const fieldOf = (field: string) => sql`ch.fields->${field}->>'v'`;
  const columns = getTableColumns(taskTable);
  const select = sql.join(
    Object.values(columns).map((column) => {
      const name = column.name;
      const rule = RULES[name];
      if (rule) {
        // Solo si la fila guardaba la clave (`firsts` lo deja en nada si
        // no): la actividad de antes de la ADR 085 no traia el valor anterior
        // de algunos campos, y entonces vale el de ahora.
        return sql`CASE WHEN ch.fields ? ${rule.field} THEN ${rule.cast(fieldOf(rule.field))} ELSE t.${sql.identifier(name)} END AS ${sql.identifier(name)}`;
      }
      if (name === "is_milestone") {
        return sql`CASE WHEN ch.fields ? 'milestone' THEN NOT (${fieldOf("milestone")})::boolean ELSE t."is_milestone" END AS "is_milestone"`;
      }
      if (name === "custom_fields") {
        return sql`CASE WHEN ch.custom IS NULL THEN t."custom_fields" ELSE
          (t."custom_fields" - ARRAY(
            SELECT e.key FROM jsonb_each(ch.custom) AS e(key, value)
            WHERE e.value = 'null'::jsonb
          )) || COALESCE((
            SELECT jsonb_object_agg(e.key, e.value)
            FROM jsonb_each(ch.custom) AS e(key, value)
            WHERE e.value <> 'null'::jsonb
          ), '{}'::jsonb)
        END AS "custom_fields"`;
      }
      if (name === "completed_at") {
        return sql`CASE WHEN t."completed_at" > ${atSql} THEN NULL ELSE t."completed_at" END AS "completed_at"`;
      }
      return sql`t.${sql.identifier(name)}`;
    }),
    sql`, `,
  );

  const differs = sql.join(
    [
      "title",
      "status",
      "priority",
      "assignee_id",
      "start_date",
      "due_date",
      "estimate",
    ].map(
      (name) =>
        sql`${sql.identifier(name)} IS DISTINCT FROM ${sql.identifier(`cur_${name}`)}`,
    ),
    sql` OR `,
  );

  // Una sola consulta. Lo que casa ahora va primero en el WITH, antes de la
  // CTE `task`, para que su `"task"` sea todavia la tabla de verdad. Del
  // pasado solo vuelve lo que interesa —lo que ya no casa o cambio, con sus
  // valores—, y del presente, lo que «entro». Las pertenencias se miran con
  // `IN` en la lista de columnas, donde Postgres no puede convertirlas en un
  // join y las resuelve con un hash: sin estadisticas de las CTE, como join
  // elegia un bucle anidado de diez mil por diez mil filas.
  const result = await db.execute<Row & { kind: "past" | "added" }>(sql`
    WITH current AS MATERIALIZED (
      SELECT "task"."id" FROM public."task" WHERE ${where ?? sql`true`}
    ),
    changes AS MATERIALIZED (
      SELECT
        task_id,
        jsonb_object_agg(field, old)
          FILTER (WHERE field <> 'custom' AND old IS NOT NULL) AS fields,
        jsonb_object_agg(key, old->'v')
          FILTER (WHERE field = 'custom' AND old IS NOT NULL) AS custom
      FROM (${firsts}) firsts
      GROUP BY task_id
    ),
    task AS MATERIALIZED (
      SELECT ${select}
      FROM public."task" t
      LEFT JOIN changes ch ON ch.task_id = t."id"
      WHERE t."project_id" = ${projectId} AND t."created_at" <= ${atSql}
    ),
    seeds AS MATERIALIZED (
      SELECT "task"."id" FROM "task" WHERE ${branch ?? sql`false`}
    ),
    matched AS MATERIALIZED (
      SELECT
        "task"."id", "task"."number", "task"."title", "task"."status",
        "task"."priority", "task"."assignee_id", "task"."start_date",
        "task"."due_date", "task"."estimate",
        ("task"."id" IN (SELECT "id" FROM current)) AS is_current,
        cur."title" AS cur_title, cur."status" AS cur_status,
        cur."priority" AS cur_priority, cur."assignee_id" AS cur_assignee_id,
        cur."start_date" AS cur_start_date, cur."due_date" AS cur_due_date,
        cur."estimate" AS cur_estimate
      FROM "task"
      LEFT JOIN public."task" cur ON cur."id" = "task"."id"
      WHERE ${pastWhere ?? sql`true`}
        ${
          branch
            ? sql`AND (
                SELECT bool_or(ancestor.id IN (SELECT "id" FROM seeds))
                FROM unnest(
                  string_to_array(trim(both '/' from "task"."path"), '/')
                ) AS ancestor(id)
              )`
            : sql``
        }
    )
    SELECT
      'past' AS kind, id, number, title, status, priority, assignee_id,
      start_date::text, due_date::text, estimate, cur_title, cur_status,
      cur_priority, cur_assignee_id, cur_start_date::text, cur_due_date::text,
      cur_estimate, is_current
    FROM matched
    WHERE NOT is_current OR ${differs}
    UNION ALL
    SELECT
      'added', id, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
      NULL, NULL, NULL, NULL, NULL, true
    FROM current
    WHERE id NOT IN (SELECT id FROM matched)
  `);

  const added = result.rows
    .filter((row) => row.kind === "added")
    .map((row) => row.id);
  const past = result.rows.filter((row) => row.kind === "past");
  const removed = past.filter((row) => !row.is_current).map(pastTask);
  const changed = past
    .filter((row) => row.is_current)
    .flatMap((row) => {
      const before: Partial<BaselineTask> = {};
      for (const [key, pastKey, currentKey] of DISPLAY) {
        const then =
          pastKey === "start_date" || pastKey === "due_date"
            ? toIso(row[pastKey] as string | null)
            : row[pastKey];
        const now =
          currentKey === "cur_start_date" || currentKey === "cur_due_date"
            ? toIso(row[currentKey] as string | null)
            : row[currentKey];
        if ((then ?? null) !== (now ?? null)) {
          (before as Record<string, unknown>)[key] = then ?? null;
        }
      }
      return Object.keys(before).length > 0 ? [{ id: row.id, before }] : [];
    });

  return { at: at.toISOString(), added, removed, changed };
}
