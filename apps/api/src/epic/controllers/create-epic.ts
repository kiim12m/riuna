import { eq, max } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { epicTable } from "../../database/schema";
import { publishEvent } from "../../events";

async function createEpic({
  projectId,
  name,
  description,
  color,
  startDate,
  dueDate,
  currentUserId,
}: {
  projectId: string;
  name: string;
  description?: string | null;
  color?: string | null;
  startDate?: Date | null;
  dueDate?: Date | null;
  currentUserId: string;
}) {
  const trimmed = name.trim();

  if (!trimmed) {
    throw new HTTPException(400, { message: "Epic name is required" });
  }

  const [row] = await db
    .select({ maxPosition: max(epicTable.position) })
    .from(epicTable)
    .where(eq(epicTable.projectId, projectId));

  const [epic] = await db
    .insert(epicTable)
    .values({
      projectId,
      name: trimmed,
      description: description ?? null,
      color: color ?? null,
      startDate: startDate ?? null,
      dueDate: dueDate ?? null,
      position: (row?.maxPosition ?? 0) + 1,
    })
    .returning();

  if (!epic) {
    throw new HTTPException(500, { message: "Failed to create epic" });
  }

  await publishEvent("epic.changed", {
    projectId,
    epicId: epic.id,
    userId: currentUserId,
  });

  return epic;
}

export default createEpic;
