import { and, eq, inArray } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { columnTable } from "../../database/schema";

async function reorderColumns(
  projectId: string,
  columns: Array<{ id: string; position: number }>,
) {
  const ids = columns.map((col) => col.id);
  if (new Set(ids).size !== ids.length) {
    throw new HTTPException(400, {
      message: "Duplicate column ids in reorder payload",
    });
  }

  // Se comprueba el lote entero antes de escribir, y se escribe en una
  // transaccion, como en `reorder-projects.ts`: una columna ajena a mitad de
  // lista dejaba las anteriores ya movidas.
  await db.transaction(async (tx) => {
    const owned = ids.length
      ? await tx
          .select({ id: columnTable.id })
          .from(columnTable)
          .where(
            and(
              eq(columnTable.projectId, projectId),
              inArray(columnTable.id, ids),
            ),
          )
      : [];
    const ownedIds = new Set(owned.map((col) => col.id));
    const foreignId = ids.find((id) => !ownedIds.has(id));
    if (foreignId) {
      throw new HTTPException(400, {
        message: `Column ${foreignId} does not belong to this project`,
      });
    }

    for (const col of columns) {
      await tx
        .update(columnTable)
        .set({ position: col.position })
        .where(eq(columnTable.id, col.id));
    }
  });

  return db.query.columnTable.findMany({
    where: eq(columnTable.projectId, projectId),
    orderBy: (columns, { asc }) => [asc(columns.position)],
  });
}

export default reorderColumns;
