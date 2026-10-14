import { and, eq, inArray, type SQL, sql } from "drizzle-orm";
import db from "../../database";
import { projectTable, taskTable } from "../../database/schema";
import { publishEvent } from "../../events";
import type { DbOrTx } from "../../task/controllers/assignees";
import { lockProjectTree } from "../../task/controllers/lock-project-tree";
import { subtreePattern } from "../../task/tree";
import { getProjectWorkspaceId } from "../../utils/assert-assignable-user";
import log from "../../utils/log";
import { getFieldDefinitionsForProject } from "../controllers/get-field-definitions";
import { compileFormula, parseStoredFormula } from "./compile";
import { type FormulaNode, usesBranchValues } from "./parse";

// Los campos calculados se guardan en `task.custom_fields` como cualquier otro
// numero (ADR 090): asi el motor de filtros, el orden, las exportaciones y el
// MCP los leen sin saber que existen. El precio es recalcularlos cada vez que
// cambia algo que leen, y eso es este modulo.

/** Por encima de esto se recalcula el proyecto entero en una sola pasada. */
const MAX_TARGETED = 200;

/** `jsonb_build_object` acepta 100 argumentos: 50 parejas. Se trocea antes. */
const PAIRS_PER_OBJECT = 40;

type Plan = {
  formulas: Map<string, FormulaNode>;
  usesBranch: boolean;
};

async function loadPlan(projectId: string): Promise<Plan | null> {
  const workspaceId = await getProjectWorkspaceId(projectId);
  const definitions = await getFieldDefinitionsForProject(
    workspaceId,
    projectId,
  );

  const formulas = new Map<string, FormulaNode>();
  for (const definition of definitions) {
    if (definition.type !== "formula") continue;
    try {
      formulas.set(
        definition.key,
        parseStoredFormula(String(definition.config.expression ?? "")),
      );
    } catch (error) {
      log.warn("Formula guardada ilegible", error, { key: definition.key });
      formulas.set(definition.key, { kind: "empty" });
    }
  }

  if (formulas.size === 0) return null;

  return {
    formulas,
    usesBranch: [...formulas.values()].some(usesBranchValues),
  };
}

/**
 * El documento nuevo: el actual sin las claves calculadas, mas las que salgan
 * con valor. Va escrito sobre la fila que se actualiza —no sobre una lectura
 * previa— para que una escritura concurrente en otro campo no se pierda.
 */
function nextCustomFields(
  plan: Plan,
  customFields: SQL,
  branch: { estimate: SQL; logged: SQL } | null,
) {
  const keys = [...plan.formulas.keys()];
  const pairs = keys.map((key) => {
    let value: SQL;
    try {
      value = compileFormula(key, {
        customFields,
        branch,
        formulas: plan.formulas,
      });
    } catch (error) {
      // Un ciclo que solo aparece en este proyecto —una clave del espacio que
      // el proyecto redefine— deja vacio ese campo, no sin recalcular el resto.
      log.warn("Formula sin calcular", error, { key });
      value = sql`NULL::numeric`;
    }
    return sql`${key}::text, ${value}`;
  });

  const objects: SQL[] = [];
  for (let index = 0; index < pairs.length; index += PAIRS_PER_OBJECT) {
    const chunk = pairs.slice(index, index + PAIRS_PER_OBJECT);
    objects.push(
      sql`jsonb_strip_nulls(jsonb_build_object(${sql.join(chunk, sql`, `)}))`,
    );
  }

  return sql`((${customFields} - ${sql.param(keys)}::text[]) || ${sql.join(objects, sql` || `)})`;
}

const ROW_FIELDS = sql`t."custom_fields"`;

/** Recalcula unas tareas concretas, sin valores de rama. */
async function refreshRows(
  executor: DbOrTx,
  plan: Plan,
  projectId: string,
  taskIds: string[] | null,
) {
  const next = nextCustomFields(plan, ROW_FIELDS, null);
  const result = await executor.execute<{ id: string }>(sql`
    UPDATE "task" AS t SET "custom_fields" = ${next}
    WHERE t."project_id" = ${projectId}
      ${taskIds ? sql`AND t."id" = ANY(${sql.param(taskIds)}::text[])` : sql``}
      AND t."custom_fields" IS DISTINCT FROM ${next}
    RETURNING t."id" AS id
  `);
  return result.rows.map((row) => row.id);
}

/**
 * Los ancestros de una tarea son los segmentos de su propio `path`, y el
 * `path` de cada uno es el prefijo hasta el: se calculan sin ir a la base.
 */
function withAncestors(rows: Array<{ path: string }>) {
  const paths = new Map<string, string>();
  for (const row of rows) {
    const segments = row.path.split("/").filter(Boolean);
    segments.forEach((id, index) => {
      paths.set(id, `/${segments.slice(0, index + 1).join("/")}/`);
    });
  }
  return paths;
}

/**
 * Recalcula unas tareas y sus ancestros con la estimacion y lo registrado de
 * cada rama. Cada rama se suma con un `LIKE` de patron constante, que si usa
 * `task_path_idx`; un patron que dependiera de la fila exterior recorreria el
 * proyecto entero por cada tarea (`AGENTS.md`).
 */
async function refreshTargets(
  executor: DbOrTx,
  plan: Plan,
  projectId: string,
  targets: Map<string, string>,
) {
  const values = [...targets].map(([id, path]) => {
    const branch = sql`d."project_id" = ${projectId}
      AND d."path" LIKE ${subtreePattern(path)}
      AND (d."id" = ${id} OR d."status" <> 'archived')`;
    return sql`(
      ${id}::text,
      (SELECT SUM(d."estimate") FROM "task" d WHERE ${branch}),
      (SELECT COALESCE(SUM(te."duration"), 0) FROM "time_entry" te
        JOIN "task" d ON d."id" = te."task_id" WHERE ${branch})
    )`;
  });

  const next = nextCustomFields(plan, ROW_FIELDS, {
    estimate: sql`b."estimate"`,
    logged: sql`b."logged"`,
  });

  const result = await executor.execute<{ id: string }>(sql`
    UPDATE "task" AS t SET "custom_fields" = ${next}
    FROM (VALUES ${sql.join(values, sql`, `)}) AS b("id", "estimate", "logged")
    WHERE t."id" = b."id" AND t."project_id" = ${projectId}
      AND t."custom_fields" IS DISTINCT FROM ${next}
    RETURNING t."id" AS id
  `);
  return result.rows.map((row) => row.id);
}

/**
 * Recalcula el proyecto entero con los valores de rama: cada tarea aporta a
 * cada uno de sus ancestros —los segmentos de su `path`, cruzados por igualdad
 * de ids—, como en `tree-aggregates`.
 */
async function refreshWholeProject(
  executor: DbOrTx,
  plan: Plan,
  projectId: string,
) {
  const next = nextCustomFields(plan, ROW_FIELDS, {
    estimate: sql`b."estimate"`,
    logged: sql`b."logged"`,
  });

  const result = await executor.execute<{ id: string }>(sql`
    WITH task_time AS (
      SELECT te."task_id" AS task_id, SUM(te."duration") AS logged
      FROM "time_entry" te
      JOIN "task" x ON x."id" = te."task_id"
      WHERE x."project_id" = ${projectId}
      GROUP BY te."task_id"
    ), branch AS (
      SELECT ancestor.id AS id,
        SUM(d."estimate") AS estimate,
        COALESCE(SUM(tt.logged), 0) AS logged
      FROM "task" d
      CROSS JOIN LATERAL unnest(
        string_to_array(trim(both '/' from d."path"), '/')
      ) AS ancestor(id)
      LEFT JOIN task_time tt ON tt.task_id = d."id"
      WHERE d."project_id" = ${projectId}
        AND (d."id" = ancestor.id OR d."status" <> 'archived')
      GROUP BY ancestor.id
    )
    UPDATE "task" AS t SET "custom_fields" = ${next}
    FROM branch b
    WHERE t."id" = b.id AND t."project_id" = ${projectId}
      AND t."custom_fields" IS DISTINCT FROM ${next}
    RETURNING t."id" AS id
  `);
  return result.rows.map((row) => row.id);
}

async function run(
  plan: Plan,
  projectId: string,
  seeds: string[] | null,
): Promise<string[]> {
  if (!plan.usesBranch) return refreshRows(db, plan, projectId, seeds);

  // Con valores de rama, bajo el cerrojo del arbol del proyecto: dos
  // recalculos de la misma rama a la vez podrian confirmar en orden inverso
  // al de sus lecturas y dejar el valor viejo.
  return db.transaction(async (tx) => {
    await lockProjectTree(tx, projectId);
    if (!seeds) return refreshWholeProject(tx, plan, projectId);

    const rows = await tx
      .select({ path: taskTable.path })
      .from(taskTable)
      .where(
        and(eq(taskTable.projectId, projectId), inArray(taskTable.id, seeds)),
      );
    const targets = withAncestors(rows);
    if (targets.size === 0) return [];
    if (targets.size > MAX_TARGETED) {
      return refreshWholeProject(tx, plan, projectId);
    }
    return refreshTargets(tx, plan, projectId, targets);
  });
}

async function refresh(projectId: string, seeds: string[] | null) {
  const plan = await loadPlan(projectId);
  if (!plan) return;

  const changed = await run(plan, projectId, seeds);
  if (changed.length === 0) return;

  // Lo cambiado puede ser un ancestro que nadie toco: sin esto, quien lo tenga
  // abierto seguiria viendo el valor anterior.
  await publishEvent("task.formulas_refreshed", {
    projectId,
    taskId: changed[0],
    taskIds: changed,
  });
}

/**
 * Despues de cambiar algo que una formula lee —un campo, la estimacion, el
 * tiempo, el estado o el arbol—, recalcula esas tareas y, si alguna formula
 * lee valores de rama, sus ancestros. Va fuera de la transaccion de quien
 * escribe, como `scheduleAfter`: un recalculo que falla deja el valor viejo y
 * un aviso en el registro, nunca una escritura rechazada.
 */
export async function refreshFormulasAfter({
  projectId,
  taskIds,
}: {
  projectId: string;
  taskIds: Array<string | null | undefined>;
}) {
  const seeds = [...new Set(taskIds.filter((id): id is string => !!id))];
  if (seeds.length === 0) return;
  try {
    await refresh(projectId, seeds);
  } catch (error) {
    log.error("No se pudieron recalcular los campos calculados", error, {
      projectId,
    });
  }
}

/**
 * Lo mismo sin saber el proyecto: para el tiempo registrado, que llega con el
 * id de la tarea y, al arrancar un cronometro, cierra el de otra.
 */
export async function refreshFormulasForTasks(
  taskIds: Array<string | null | undefined>,
) {
  const ids = [...new Set(taskIds.filter((id): id is string => !!id))];
  if (ids.length === 0) return;
  try {
    const rows = await db
      .select({ id: taskTable.id, projectId: taskTable.projectId })
      .from(taskTable)
      .where(inArray(taskTable.id, ids));
    const byProject = new Map<string, string[]>();
    for (const row of rows) {
      byProject.set(row.projectId, [
        ...(byProject.get(row.projectId) ?? []),
        row.id,
      ]);
    }
    for (const [projectId, seeds] of byProject) {
      await refreshFormulasAfter({ projectId, taskIds: seeds });
    }
  } catch (error) {
    log.error("No se pudieron recalcular los campos calculados", error, {
      taskIds: ids,
    });
  }
}

/** Todas las tareas de un proyecto: tras importar o cambiar una formula. */
export async function refreshProjectFormulas(projectId: string) {
  try {
    await refresh(projectId, null);
  } catch (error) {
    log.error("No se pudieron recalcular los campos calculados", error, {
      projectId,
    });
  }
}

/** Todos los proyectos del espacio: tras cambiar una formula del espacio. */
export async function refreshWorkspaceFormulas(workspaceId: string) {
  const projects = await db
    .select({ id: projectTable.id })
    .from(projectTable)
    .where(eq(projectTable.workspaceId, workspaceId));
  for (const project of projects) {
    await refreshProjectFormulas(project.id);
  }
}
