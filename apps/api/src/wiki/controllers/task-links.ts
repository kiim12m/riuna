import { asc, eq } from "drizzle-orm";
import db from "../../database";
import { wikiLinkTable, wikiPageTable } from "../../database/schema";

/**
 * Las paginas enlazadas con una tarea, en cualquiera de los dos sentidos,
 * cada una una vez. Para el detalle de la tarea: un indice por `task_id`.
 */
export default async function listTaskWikiLinks(taskId: string) {
  const rows = await db
    .select({
      pageId: wikiPageTable.id,
      title: wikiPageTable.title,
      projectId: wikiPageTable.projectId,
      source: wikiLinkTable.source,
    })
    .from(wikiLinkTable)
    .innerJoin(wikiPageTable, eq(wikiLinkTable.pageId, wikiPageTable.id))
    .where(eq(wikiLinkTable.taskId, taskId))
    .orderBy(asc(wikiPageTable.title));

  const byPage = new Map<
    string,
    {
      pageId: string;
      title: string;
      projectId: string | null;
      sources: string[];
    }
  >();
  for (const { source, ...page } of rows) {
    const entry = byPage.get(page.pageId) ?? { ...page, sources: [] };
    entry.sources.push(source);
    byPage.set(page.pageId, entry);
  }
  return [...byPage.values()];
}
