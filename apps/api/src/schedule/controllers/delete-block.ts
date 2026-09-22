import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { scheduleBlockTable } from "../../database/schema";
import { publishEvent } from "../../events";

export default async function deleteBlock({
  userId,
  id,
}: {
  userId: string;
  id: string;
}) {
  const [block] = await db
    .delete(scheduleBlockTable)
    .where(
      and(eq(scheduleBlockTable.id, id), eq(scheduleBlockTable.userId, userId)),
    )
    .returning();

  if (!block) {
    throw new HTTPException(404, { message: "Block not found" });
  }

  await publishEvent("schedule.changed", { userId });

  return block;
}
