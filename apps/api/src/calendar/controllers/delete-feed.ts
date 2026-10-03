import { and, eq } from "drizzle-orm";
import db from "../../database";
import { calendarFeedTable } from "../../database/schema";

/** Revoca el enlace: la fila se va y el token deja de valer. */
export default async function deleteFeed({
  workspaceId,
  userId,
}: {
  workspaceId: string;
  userId: string;
}) {
  await db
    .delete(calendarFeedTable)
    .where(
      and(
        eq(calendarFeedTable.workspaceId, workspaceId),
        eq(calendarFeedTable.userId, userId),
      ),
    );

  return { active: false, createdAt: null };
}
