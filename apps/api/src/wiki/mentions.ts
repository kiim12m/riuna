import { and, eq, like, lt, or } from "drizzle-orm";
import db from "../database";
import { userTable, wikiPageVersionTable } from "../database/schema";
import createNotification from "../notification/controllers/create-notification";
import { escapeLikePattern } from "../search/like-pattern";
import { filterAssignableUsers } from "../utils/assert-assignable-user";
import { log } from "../utils/log";
import { parseMentionIds } from "../utils/parse-mentions";

/**
 * Avisa a quien sale mencionado en una pagina por primera vez (ADR 092): ni
 * en esta version anterior ni en ninguna otra. Solo personas del espacio, y
 * nunca a quien escribe.
 */
export async function notifyWikiMentions({
  page,
  content,
  editorId,
}: {
  page: {
    id: string;
    title: string;
    version: number;
    workspaceId: string;
    projectId: string | null;
  };
  content: string;
  editorId: string;
}) {
  try {
    const mentioned = parseMentionIds(content).filter((id) => id !== editorId);
    if (mentioned.length === 0) return;

    // Solo las versiones que nombran a alguno: el historial guarda cada
    // version entera y no hace falta traerlo todo.
    const earlier = await db
      .select({ content: wikiPageVersionTable.content })
      .from(wikiPageVersionTable)
      .where(
        and(
          eq(wikiPageVersionTable.pageId, page.id),
          lt(wikiPageVersionTable.version, page.version),
          or(
            ...mentioned.map((id) =>
              like(wikiPageVersionTable.content, `%${escapeLikePattern(id)}%`),
            ),
          ),
        ),
      );
    const already = new Set(
      earlier.flatMap((row) => parseMentionIds(row.content)),
    );
    const members = await filterAssignableUsers(
      mentioned.filter((id) => !already.has(id)),
      page.workspaceId,
    );
    if (members.size === 0) return;

    const [editor] = await db
      .select({ name: userTable.name })
      .from(userTable)
      .where(eq(userTable.id, editorId));

    for (const userId of members) {
      await createNotification({
        userId,
        type: "wiki_mention",
        eventData: {
          pageTitle: page.title,
          mentionerName: editor?.name ?? null,
          workspaceId: page.workspaceId,
          projectId: page.projectId,
        },
        resourceId: page.id,
        resourceType: "wiki_page",
      });
    }
  } catch (error) {
    log.error("No se pudo avisar de las menciones de la wiki", error, {
      pageId: page.id,
    });
  }
}
