import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { publishEvent } from "../../events";
import { closeRunningEntry } from "../running";

/**
 * Para el cronometro en marcha de quien mira. `endTime` es para cuando se
 * olvido pararlo un rato -o un dia- y la hora real de fin no es ahora.
 */
async function stopTimer({
  userId,
  endTime,
}: {
  userId: string;
  endTime?: Date;
}) {
  const closed = await closeRunningEntry(db, userId, endTime ?? new Date());

  if (!closed) {
    throw new HTTPException(404, {
      message: "No time entry is currently running",
    });
  }

  await publishEvent("time-entry.stopped", {
    timeEntryId: closed.id,
    taskId: closed.taskId,
    userId,
  });

  return closed;
}

export default stopTimer;
