import { and, asc, eq, isNull, or } from "drizzle-orm";
import db from "../../database";
import { wikiPageTable } from "../../database/schema";
import { assertProjectInWorkspace } from "../scope";

/**
 * El arbol de la wiki: las paginas del espacio y, si se pide un proyecto, las
 * suyas. Sin el contenido, que puede ser largo y solo hace falta al abrir una.
 */
export default async function listWikiPages(
  workspaceId: string,
  projectId: string | null,
) {
  await assertProjectInWorkspace(workspaceId, projectId);

  return db
    .select({
      id: wikiPageTable.id,
      title: wikiPageTable.title,
      parentId: wikiPageTable.parentId,
      projectId: wikiPageTable.projectId,
      position: wikiPageTable.position,
      version: wikiPageTable.version,
      updatedAt: wikiPageTable.updatedAt,
    })
    .from(wikiPageTable)
    .where(
      and(
        eq(wikiPageTable.workspaceId, workspaceId),
        projectId
          ? or(
              isNull(wikiPageTable.projectId),
              eq(wikiPageTable.projectId, projectId),
            )
          : isNull(wikiPageTable.projectId),
      ),
    )
    .orderBy(asc(wikiPageTable.position), asc(wikiPageTable.title));
}
