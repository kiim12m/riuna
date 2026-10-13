import { and, eq, ne } from "drizzle-orm";
import db from "../../database";
import { taskTable } from "../../database/schema";
import type { DbOrTx } from "../controllers/assignees";

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
