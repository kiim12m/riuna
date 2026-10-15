import { eq, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { wikiPageTable } from "../../database/schema";
import type { DbOrTx } from "../../task/controllers/assignees";
import {
  assertParentInScope,
  loadPage,
  nextPosition,
  publishWikiChange,
} from "../scope";

/**
 * Serializa las escrituras de arbol de la wiki de un espacio, como
 * `lockProjectTree` con las tareas: dos movimientos cruzados validados a la vez
 * cerrarian un ciclo. El 1149 es el espacio de nombres de este cerrojo.
 */
export async function lockWikiTree(tx: DbOrTx, workspaceId: string) {
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(1149, hashtext(${workspaceId}))`,
  );
}

/**
 * Moverla no es editarla: `updated_at` es la fecha de su ultima version, la que
 * enseña «editada por … hace …», y sin esto el `$onUpdate` la pondria a ahora.
 */
export const keepUpdatedAt = sql`${wikiPageTable.updatedAt}`;

/** Cuelga una pagina de otra de su misma wiki, o la deja en la raiz. */
export default async function moveWikiPage({
  id,
  parentId,
  userId,
}: {
  id: string;
  parentId: string | null;
  userId: string;
}) {
  const { workspaceId } = await loadPage(id);

  const moved = await db.transaction(async (tx) => {
    await lockWikiTree(tx, workspaceId);
    const page = await loadPage(id, tx);
    const scope = { workspaceId: page.workspaceId, projectId: page.projectId };
    await assertParentInScope(parentId, scope, tx);

    // Sube desde el padre nuevo: si pasa por la propia pagina, seria un ciclo.
    let cursor = parentId;
    while (cursor) {
      if (cursor === id) {
        throw new HTTPException(400, {
          message: "A page cannot hang from itself or from one of its subpages",
        });
      }
      const [row] = await tx
        .select({ parentId: wikiPageTable.parentId })
        .from(wikiPageTable)
        .where(eq(wikiPageTable.id, cursor));
      cursor = row?.parentId ?? null;
    }

    if (page.parentId === parentId) return page;

    const position = await nextPosition({ ...scope, parentId }, tx);
    const [updated] = await tx
      .update(wikiPageTable)
      .set({ parentId, position, updatedAt: keepUpdatedAt })
      .where(eq(wikiPageTable.id, id))
      .returning();
    if (!updated) throw new Error("The wiki page was not moved");
    return updated;
  });

  await publishWikiChange(moved, userId, "moved");
  return moved;
}
