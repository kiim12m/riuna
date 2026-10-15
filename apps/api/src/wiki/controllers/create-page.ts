import db from "../../database";
import { wikiPageTable, wikiPageVersionTable } from "../../database/schema";
import { syncPageLinks } from "../links";
import { notifyWikiMentions } from "../mentions";
import {
  assertParentInScope,
  assertProjectInWorkspace,
  cleanTitle,
  nextPosition,
  publishWikiChange,
} from "../scope";

/** Una pagina nueva, al final de sus hermanas, con su version 1. */
export default async function createWikiPage({
  workspaceId,
  projectId,
  parentId,
  title,
  content,
  userId,
}: {
  workspaceId: string;
  projectId: string | null;
  parentId: string | null;
  title: string;
  content: string;
  userId: string;
}) {
  await assertProjectInWorkspace(workspaceId, projectId);
  const scope = { workspaceId, projectId };

  const page = await db.transaction(async (tx) => {
    await assertParentInScope(parentId, scope, tx);
    const position = await nextPosition({ ...scope, parentId }, tx);
    const [created] = await tx
      .insert(wikiPageTable)
      .values({
        ...scope,
        parentId,
        title: cleanTitle(title),
        content,
        position,
        createdBy: userId,
        updatedBy: userId,
      })
      .returning();
    if (!created) throw new Error("The wiki page was not created");

    await tx.insert(wikiPageVersionTable).values({
      pageId: created.id,
      version: created.version,
      title: created.title,
      content: created.content,
      authorId: userId,
    });
    await syncPageLinks(tx, created, created.content);
    return created;
  });

  await notifyWikiMentions({ page, content: page.content, editorId: userId });
  await publishWikiChange(page, userId, "created");
  return page;
}
