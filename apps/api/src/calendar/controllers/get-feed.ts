import { and, eq } from "drizzle-orm";
import db from "../../database";
import { calendarFeedTable } from "../../database/schema";

/** Si hay enlace y desde cuando; nunca el token, que solo se enseña al crearlo. */
export default async function getFeed({
  workspaceId,
  userId,
}: {
  workspaceId: string;
  userId: string;
}) {
  const [feed] = await db
    .select({ createdAt: calendarFeedTable.createdAt })
    .from(calendarFeedTable)
    .where(
      and(
        eq(calendarFeedTable.workspaceId, workspaceId),
        eq(calendarFeedTable.userId, userId),
      ),
    )
    .limit(1);

  return { active: Boolean(feed), createdAt: feed?.createdAt ?? null };
}
