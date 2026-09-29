import { createId } from "@paralleldrive/cuid2";
import { eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { taskTable, timeEntryTable } from "../../database/schema";
import { publishEvent } from "../../events";
import { resolveDuration } from "../duration";
import { closeRunningEntry } from "../running";

async function createTimeEntry({
  taskId,
  userId,
  description,
  startTime,
  endTime,
}: {
  taskId: string;
  userId: string;
  description?: string;
  startTime: Date;
  endTime?: Date;
}) {
  const duration = resolveDuration(startTime, endTime);

  // Sin `endTime` esta entrada nace en marcha (ADR 044): cerrar lo que ya
  // corria y abrir la nueva tienen que pasar juntas, o el indice unico
  // rechazaria la segunda mientras la primera sigue abierta. Con `endTime` es
  // un registro manual y no toca nada mas -es el `POST` viejo, que sigue
  // sirviendo a MCP-.
  const createdTimeEntry = await db.transaction(async (tx) => {
    if (!endTime) {
      await closeRunningEntry(tx, userId, startTime);
    }

    const [inserted] = await tx
      .insert(timeEntryTable)
      .values({
        id: createId(),
        taskId,
        userId,
        description: description || "",
        startTime,
        endTime: endTime || null,
        duration,
      })
      .returning();

    return inserted;
  });

  if (!createdTimeEntry) {
    throw new HTTPException(500, {
      message: "Failed to create time entry",
    });
  }

  const [task] = await db
    .select({ userId: taskTable.userId, title: taskTable.title })
    .from(taskTable)
    .where(eq(taskTable.id, taskId));

  await publishEvent("time-entry.created", {
    timeEntryId: createdTimeEntry.id,
    taskId: createdTimeEntry.taskId,
    userId,
    type: "create",
    content: "started time tracking",
    taskOwnerId: task?.userId,
    taskTitle: task?.title,
  });

  return createdTimeEntry;
}

export default createTimeEntry;
