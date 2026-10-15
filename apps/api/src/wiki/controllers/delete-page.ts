import { eq, sql } from "drizzle-orm";
import db from "../../database";
import { wikiPageTable } from "../../database/schema";
import {
  deleteS3Keys,
  getWikiPageAssetKeys,
} from "../../storage/cleanup-assets";
import { loadPage, publishWikiChange } from "../scope";
import { keepUpdatedAt, lockWikiTree } from "./move-page";

/**
 * Borra una pagina. Con subpaginas, quien borra elige (ADR 092): `delete` se
 * lleva la rama entera —la cascada de `parent_id`—, y `lift` cuelga las hijas
 * del padre de la borrada antes de borrarla. Los adjuntos de lo borrado se
 * van de S3 despues: sus filas caen con la cascada.
 */
export default async function deleteWikiPage({
  id,
  children,
  userId,
}: {
  id: string;
  children: "lift" | "delete";
  userId: string;
}) {
  const { workspaceId } = await loadPage(id);

  const { page, deletedIds, assetKeys } = await db.transaction(async (tx) => {
    await lockWikiTree(tx, workspaceId);
    const current = await loadPage(id, tx);

    let ids = [id];
    if (children === "lift") {
      await tx
        .update(wikiPageTable)
        .set({ parentId: current.parentId, updatedAt: keepUpdatedAt })
        .where(eq(wikiPageTable.parentId, id));
    } else {
      const branch = await tx.execute<{ id: string }>(sql`
        WITH RECURSIVE branch AS (
          SELECT id FROM wiki_page WHERE id = ${id}
          UNION ALL
          SELECT p.id FROM wiki_page p JOIN branch b ON p.parent_id = b.id
        )
        SELECT id FROM branch
      `);
      ids = branch.rows.map((row) => row.id);
    }

    const keys = await getWikiPageAssetKeys(ids, tx);
    await tx.delete(wikiPageTable).where(eq(wikiPageTable.id, id));
    return { page: current, deletedIds: ids, assetKeys: keys };
  });

  if (assetKeys.length > 0) deleteS3Keys(assetKeys).catch(() => {});
  await publishWikiChange(page, userId, "deleted");
  return { deleted: deletedIds.length };
}
