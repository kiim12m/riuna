import { and, asc, eq, isNotNull, isNull, ne, sql } from "drizzle-orm";
import db from "../../database";
import { cycleTable, taskTable } from "../../database/schema";

/**
 * Los ciclos de un proyecto, cada uno con su recuento.
 *
 * "Terminada" se lee de `task.completed_at`, que mantiene el disparador
 * `task_completed_at`, y no de la columna final. Dentro del listado da lo mismo
 * —el disparador garantiza que una cosa implica la otra—, pero el informe del
 * ciclo **necesita** la fecha para dibujar el burndown, y usar dos fuentes
 * distintas dentro del mismo modulo es como se empieza a divergir. Ver ADR 025.
 *
 * La columna del ciclo se cualifica a mano (`"cycle"."id"`) porque dentro de una
 * subconsulta drizzle la interpolaria como `"id"` a secas, y ahi eso ya no
 * apunta a la fila de fuera. Es el mismo cuidado que `get-epics.ts`.
 */
async function getCycles(projectId: string, includeClosed = true) {
  return db
    .select({
      id: cycleTable.id,
      projectId: cycleTable.projectId,
      name: cycleTable.name,
      goal: cycleTable.goal,
      status: cycleTable.status,
      startDate: cycleTable.startDate,
      endDate: cycleTable.endDate,
      closedAt: cycleTable.closedAt,
      createdAt: cycleTable.createdAt,
      taskCount: sql<number>`(
        SELECT COUNT(*)::int FROM "task" t
        WHERE t."cycle_id" = "cycle"."id" AND t."status" <> 'archived'
      )`,
      doneTaskCount: sql<number>`(
        SELECT COUNT(*)::int FROM "task" t
        WHERE t."cycle_id" = "cycle"."id" AND t."status" <> 'archived'
          AND t."completed_at" IS NOT NULL
      )`,
      // En segundos, la unidad de `estimate` y de `time_entry.duration`.
      estimateSeconds: sql<number>`(
        SELECT COALESCE(SUM(t."estimate"), 0)::bigint FROM "task" t
        WHERE t."cycle_id" = "cycle"."id" AND t."status" <> 'archived'
      )`,
      doneEstimateSeconds: sql<number>`(
        SELECT COALESCE(SUM(t."estimate"), 0)::bigint FROM "task" t
        WHERE t."cycle_id" = "cycle"."id" AND t."status" <> 'archived'
          AND t."completed_at" IS NOT NULL
      )`,
    })
    .from(cycleTable)
    .where(
      includeClosed
        ? eq(cycleTable.projectId, projectId)
        : and(
            eq(cycleTable.projectId, projectId),
            ne(cycleTable.status, "closed"),
          ),
    )
    .orderBy(asc(cycleTable.startDate), asc(cycleTable.createdAt));
}

/**
 * El ciclo activo del proyecto, si lo hay. Como mucho hay uno: lo garantiza el
 * indice parcial `cycle_one_active_per_project`.
 */
export async function getActiveCycle(projectId: string) {
  const [cycle] = await db
    .select()
    .from(cycleTable)
    .where(
      and(eq(cycleTable.projectId, projectId), eq(cycleTable.status, "active")),
    )
    .limit(1);

  return cycle ?? null;
}

async function countTasks(cycleId: string, finished: boolean) {
  const [row] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(taskTable)
    .where(
      and(
        eq(taskTable.cycleId, cycleId),
        ne(taskTable.status, "archived"),
        finished
          ? isNotNull(taskTable.completedAt)
          : isNull(taskTable.completedAt),
      ),
    );

  return row?.count ?? 0;
}

/** Cuantas tareas del ciclo siguen sin terminar: lo que el cierre tiene que resolver. */
export function countUnfinished(cycleId: string) {
  return countTasks(cycleId, false);
}

/** Cuantas se terminaron dentro: el resumen inmediato al cerrar. */
export function countFinished(cycleId: string) {
  return countTasks(cycleId, true);
}

export default getCycles;
