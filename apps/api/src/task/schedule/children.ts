import { and, eq, ne } from "drizzle-orm";
import db from "../../database";
import { taskRelationTable, taskTable } from "../../database/schema";
import type { DbOrTx } from "../controllers/assignees";

/**
 * Si la tarea sigue a alguna otra (ADR 084): con fechas automaticas, su
 * inicio sale de sus predecesoras.
 */
export async function hasPredecessors(taskId: string, executor: DbOrTx = db) {
  const [relation] = await executor
    .select({ id: taskRelationTable.id })
    .from(taskRelationTable)
    .where(
      and(
        eq(taskRelationTable.targetTaskId, taskId),
        eq(taskRelationTable.relationType, "precedes"),
      ),
    )
    .limit(1);
  return Boolean(relation);
}

/** Si la tarea tiene alguna hija sin archivar: entonces es un resumen. */
export async function hasChildren(taskId: string, executor: DbOrTx = db) {
  const [child] = await executor
    .select({ id: taskTable.id })
    .from(taskTable)
    .where(
      and(eq(taskTable.parentId, taskId), ne(taskTable.status, "archived")),
    )
    .limit(1);
  return Boolean(child);
}
