import { eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { epicTable } from "../../database/schema";
import { publishEvent } from "../../events";

async function updateEpic({
  epicId,
  name,
  description,
  color,
  startDate,
  dueDate,
  archived,
  currentUserId,
}: {
  epicId: string;
  name?: string;
  description?: string | null;
  color?: string | null;
  startDate?: Date | null;
  dueDate?: Date | null;
  archived?: boolean;
  currentUserId: string;
}) {
  const changes: Partial<typeof epicTable.$inferInsert> = {};

  if (name !== undefined) {
    const trimmed = name.trim();
    if (!trimmed) {
      throw new HTTPException(400, { message: "Epic name is required" });
    }
    changes.name = trimmed;
  }

  if (description !== undefined) changes.description = description;
  if (color !== undefined) changes.color = color;
  if (startDate !== undefined) changes.startDate = startDate;
  if (dueDate !== undefined) changes.dueDate = dueDate;
  // Borrado suave: archivar una epica no descuelga sus tareas, solo la retira
  // de los selectores y de los filtros.
  if (archived !== undefined) changes.archivedAt = archived ? new Date() : null;

  if (Object.keys(changes).length === 0) {
    throw new HTTPException(400, { message: "Nothing to update" });
  }

  const [epic] = await db
    .update(epicTable)
    .set(changes)
    .where(eq(epicTable.id, epicId))
    .returning();

  if (!epic) {
    throw new HTTPException(404, { message: "Epic not found" });
  }

  await publishEvent("epic.changed", {
    projectId: epic.projectId,
    epicId: epic.id,
    userId: currentUserId,
  });

  return epic;
}

export default updateEpic;
