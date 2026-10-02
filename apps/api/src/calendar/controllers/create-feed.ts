import db from "../../database";
import { calendarFeedTable } from "../../database/schema";
import { createFeedToken } from "../token";

/**
 * Crea el enlace o lo regenera: un token nuevo cuyo hash sustituye al
 * anterior, que deja de valer en ese momento. El token solo sale aqui.
 */
export default async function createFeed({
  workspaceId,
  userId,
}: {
  workspaceId: string;
  userId: string;
}) {
  const { token, tokenHash } = createFeedToken();
  const createdAt = new Date();

  await db
    .insert(calendarFeedTable)
    .values({ workspaceId, userId, tokenHash, createdAt })
    .onConflictDoUpdate({
      target: [calendarFeedTable.workspaceId, calendarFeedTable.userId],
      set: { tokenHash, createdAt },
    });

  return { token, createdAt };
}
