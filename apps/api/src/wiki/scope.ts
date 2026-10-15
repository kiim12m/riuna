import { and, eq, isNull, max, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../database";
import { projectTable, wikiPageTable } from "../database/schema";
import { publishEvent } from "../events";
import type { DbOrTx } from "../task/controllers/assignees";

export type WikiPage = typeof wikiPageTable.$inferSelect;

export const MAX_TITLE_LENGTH = 200;
/** Lo bastante para un manual largo; mas, y deja de ser una pagina. */
export const MAX_CONTENT_LENGTH = 500_000;

export async function loadPage(
  id: string,
  executor: DbOrTx = db,
): Promise<WikiPage> {
  const [page] = await executor
    .select()
    .from(wikiPageTable)
    .where(eq(wikiPageTable.id, id))
    .limit(1);
  if (!page) throw new HTTPException(404, { message: "Wiki page not found" });
  return page;
}

export function cleanTitle(title: string) {
  const trimmed = title.trim();
  if (!trimmed) {
    throw new HTTPException(400, { message: "A page needs a title" });
  }
  return trimmed.slice(0, MAX_TITLE_LENGTH);
}

/** Un proyecto solo vale si es del mismo espacio. */
export async function assertProjectInWorkspace(
  workspaceId: string,
  projectId: string | null,
) {
  if (!projectId) return;
  const [project] = await db
    .select({ id: projectTable.id })
    .from(projectTable)
    .where(
      and(
        eq(projectTable.id, projectId),
        eq(projectTable.workspaceId, workspaceId),
      ),
    )
    .limit(1);
  if (!project) throw new HTTPException(404, { message: "Project not found" });
}

/**
 * Una pagina cuelga de otra del mismo alcance —el espacio, o el mismo
 * proyecto—: el arbol de un proyecto no se mezcla con el de otro.
 */
export async function assertParentInScope(
  parentId: string | null,
  scope: { workspaceId: string; projectId: string | null },
  executor: DbOrTx = db,
) {
  if (!parentId) return;
  const parent = await loadPage(parentId, executor);
  if (
    parent.workspaceId !== scope.workspaceId ||
    parent.projectId !== scope.projectId
  ) {
    throw new HTTPException(400, {
      message: "A page can only hang from a page of the same wiki",
    });
  }
}

/** La siguiente posicion entre las hermanas, al final. */
export async function nextPosition(
  scope: {
    workspaceId: string;
    projectId: string | null;
    parentId: string | null;
  },
  executor: DbOrTx = db,
) {
  const [row] = await executor
    .select({ last: max(wikiPageTable.position) })
    .from(wikiPageTable)
    .where(
      and(
        eq(wikiPageTable.workspaceId, scope.workspaceId),
        scope.projectId
          ? eq(wikiPageTable.projectId, scope.projectId)
          : isNull(wikiPageTable.projectId),
        scope.parentId
          ? eq(wikiPageTable.parentId, scope.parentId)
          : isNull(wikiPageTable.parentId),
      ),
    );
  return (row?.last ?? 0) + 1;
}

/** Cuantas paginas hay en la rama de una, ella incluida. */
export async function branchSize(pageId: string, executor: DbOrTx = db) {
  const result = await executor.execute<{ count: number }>(sql`
    WITH RECURSIVE branch AS (
      SELECT id FROM wiki_page WHERE id = ${pageId}
      UNION ALL
      SELECT p.id FROM wiki_page p JOIN branch b ON p.parent_id = b.id
    )
    SELECT count(*)::int AS count FROM branch
  `);
  return result.rows[0]?.count ?? 0;
}

export type WikiChange = "created" | "updated" | "moved" | "deleted";

/**
 * Avisa del cambio a todo el espacio por el canal de usuario (ADR 092): la
 * wiki del espacio se ve desde cualquier proyecto, y el canal de proyecto
 * descarta los campos que no conoce.
 */
export async function publishWikiChange(
  page: Pick<WikiPage, "id" | "workspaceId" | "projectId" | "version">,
  userId: string,
  kind: WikiChange,
) {
  await publishEvent("wiki.page_changed", {
    workspaceId: page.workspaceId,
    projectId: page.projectId,
    pageId: page.id,
    version: page.version,
    userId,
    kind,
  });
}
