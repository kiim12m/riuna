import { and, desc, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { userTable, wikiPageVersionTable } from "../../database/schema";

/** El historial de una pagina, de la mas nueva a la mas vieja, sin texto. */
export async function listWikiVersions(
  pageId: string,
  { limit, offset }: { limit: number; offset: number },
) {
  return db
    .select({
      version: wikiPageVersionTable.version,
      title: wikiPageVersionTable.title,
      note: wikiPageVersionTable.note,
      restoredFrom: wikiPageVersionTable.restoredFrom,
      authorId: wikiPageVersionTable.authorId,
      authorName: userTable.name,
      createdAt: wikiPageVersionTable.createdAt,
    })
    .from(wikiPageVersionTable)
    .leftJoin(userTable, eq(wikiPageVersionTable.authorId, userTable.id))
    .where(eq(wikiPageVersionTable.pageId, pageId))
    .orderBy(desc(wikiPageVersionTable.version))
    .limit(limit)
    .offset(offset);
}

/** Una version con su texto, para ver diferencias o restaurarla. */
export async function getWikiVersion(pageId: string, version: number) {
  const [row] = await db
    .select({
      version: wikiPageVersionTable.version,
      title: wikiPageVersionTable.title,
      content: wikiPageVersionTable.content,
      note: wikiPageVersionTable.note,
      restoredFrom: wikiPageVersionTable.restoredFrom,
      authorName: userTable.name,
      createdAt: wikiPageVersionTable.createdAt,
    })
    .from(wikiPageVersionTable)
    .leftJoin(userTable, eq(wikiPageVersionTable.authorId, userTable.id))
    .where(
      and(
        eq(wikiPageVersionTable.pageId, pageId),
        eq(wikiPageVersionTable.version, version),
      ),
    )
    .limit(1);
  if (!row) throw new HTTPException(404, { message: "Version not found" });
  return row;
}
