import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { wikiPageTable, wikiPageVersionTable } from "../../database/schema";
import { syncPageLinks } from "../links";
import { notifyWikiMentions } from "../mentions";
import { cleanTitle, loadPage, publishWikiChange } from "../scope";

/**
 * Guarda una pagina con bloqueo optimista (ADR 092): `baseVersion` es la que
 * tenia quien edita al empezar. Si ya no es la ultima, alguien guardo entre
 * medias y es un 409; quien quiera guardar encima repite con la nueva. Sin
 * cambios no hay version nueva.
 */
export default async function saveWikiPage({
  id,
  title,
  content,
  baseVersion,
  note,
  restoredFrom = null,
  userId,
}: {
  id: string;
  title: string;
  content: string;
  baseVersion: number;
  note?: string | null;
  restoredFrom?: number | null;
  userId: string;
}) {
  const nextTitle = cleanTitle(title);

  const result = await db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(wikiPageTable)
      .where(eq(wikiPageTable.id, id))
      .for("update");
    if (!current) {
      throw new HTTPException(404, { message: "Wiki page not found" });
    }
    if (current.version !== baseVersion) {
      throw new HTTPException(409, {
        message: `Someone saved version ${current.version} of this page while you were editing version ${baseVersion}`,
      });
    }
    if (current.title === nextTitle && current.content === content) {
      return { page: current, changed: false };
    }

    const [updated] = await tx
      .update(wikiPageTable)
      .set({
        title: nextTitle,
        content,
        version: current.version + 1,
        updatedBy: userId,
      })
      .where(eq(wikiPageTable.id, id))
      .returning();
    if (!updated) throw new Error("The wiki page was not saved");

    await tx.insert(wikiPageVersionTable).values({
      pageId: id,
      version: updated.version,
      title: updated.title,
      content: updated.content,
      authorId: userId,
      note: note?.trim() || null,
      restoredFrom,
    });
    await syncPageLinks(tx, updated, updated.content);
    return { page: updated, changed: true };
  });

  if (result.changed) {
    await notifyWikiMentions({
      page: result.page,
      content: result.page.content,
      editorId: userId,
    });
    await publishWikiChange(result.page, userId, "updated");
  }
  return result.page;
}

/** Vuelve a una version anterior: es guardar su titulo y su texto. */
export async function restoreWikiVersion({
  id,
  version,
  baseVersion,
  userId,
}: {
  id: string;
  version: number;
  baseVersion: number;
  userId: string;
}) {
  await loadPage(id);
  const [old] = await db
    .select()
    .from(wikiPageVersionTable)
    .where(
      and(
        eq(wikiPageVersionTable.pageId, id),
        eq(wikiPageVersionTable.version, version),
      ),
    )
    .limit(1);
  if (!old) throw new HTTPException(404, { message: "Version not found" });

  return saveWikiPage({
    id,
    title: old.title,
    content: old.content,
    baseVersion,
    restoredFrom: version,
    userId,
  });
}
