import { eq } from "drizzle-orm";
import db from "../../database";
import {
  projectTable,
  taskTable,
  userTable,
  wikiLinkTable,
} from "../../database/schema";
import { loadPage } from "../scope";

/**
 * Una pagina con quien la guardo por ultima vez, su proyecto y las tareas que
 * la enlazan o que enlaza ella (ADR 092), cada una una vez.
 */
export default async function getWikiPage(id: string) {
  const page = await loadPage(id);

  const [author, project, links] = await Promise.all([
    page.updatedBy
      ? db
          .select({ name: userTable.name })
          .from(userTable)
          .where(eq(userTable.id, page.updatedBy))
          .then((rows) => rows[0]?.name ?? null)
      : Promise.resolve(null),
    page.projectId
      ? db
          .select({
            id: projectTable.id,
            name: projectTable.name,
            slug: projectTable.slug,
          })
          .from(projectTable)
          .where(eq(projectTable.id, page.projectId))
          .then((rows) => rows[0] ?? null)
      : Promise.resolve(null),
    db
      .select({
        taskId: taskTable.id,
        number: taskTable.number,
        title: taskTable.title,
        status: taskTable.status,
        projectId: taskTable.projectId,
        projectSlug: projectTable.slug,
        source: wikiLinkTable.source,
      })
      .from(wikiLinkTable)
      .innerJoin(taskTable, eq(wikiLinkTable.taskId, taskTable.id))
      .innerJoin(projectTable, eq(taskTable.projectId, projectTable.id))
      .where(eq(wikiLinkTable.pageId, id)),
  ]);

  const byTask = new Map<
    string,
    Omit<(typeof links)[number], "source"> & { sources: string[] }
  >();
  for (const { source, ...link } of links) {
    const entry = byTask.get(link.taskId) ?? { ...link, sources: [] };
    entry.sources.push(source);
    byTask.set(link.taskId, entry);
  }

  return {
    ...page,
    updatedByName: author,
    project,
    links: [...byTask.values()].sort((a, b) =>
      a.projectSlug === b.projectSlug
        ? (a.number ?? 0) - (b.number ?? 0)
        : a.projectSlug.localeCompare(b.projectSlug),
    ),
  };
}
