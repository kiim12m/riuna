import { and, eq, or, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { columnTable, taskTable } from "../../database/schema";

async function deleteColumn(id: string) {
  const existing = await db.query.columnTable.findFirst({
    where: eq(columnTable.id, id),
  });

  if (!existing) {
    throw new HTTPException(404, { message: "Column not found" });
  }

  // Tambien las que solo la nombran por `status`, con `column_id` nulo: el
  // tablero las pinta en esta columna, y al borrarla desaparecerian de el.
  const [taskCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(taskTable)
    .where(
      or(
        eq(taskTable.columnId, id),
        and(
          eq(taskTable.projectId, existing.projectId),
          eq(taskTable.status, existing.slug),
        ),
      ),
    );

  if (taskCount && taskCount.count > 0) {
    throw new HTTPException(409, {
      message:
        "Cannot delete column that contains tasks. Move or delete tasks first.",
    });
  }

  await db.delete(columnTable).where(eq(columnTable.id, id));

  return existing;
}

export default deleteColumn;
