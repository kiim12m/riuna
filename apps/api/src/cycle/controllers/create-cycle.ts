import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { cycleTable } from "../../database/schema";
import { publishEvent } from "../../events";

async function createCycle({
  projectId,
  name,
  goal,
  startDate,
  endDate,
  currentUserId,
}: {
  projectId: string;
  name: string;
  goal?: string | null;
  startDate: Date;
  endDate: Date;
  currentUserId: string;
}) {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new HTTPException(400, { message: "Cycle name is required" });
  }

  // La base tambien lo vigila con `cycle_dates_ordered`, pero un 400 con este
  // texto es mas util que un 500 con el nombre de una restriccion.
  if (endDate < startDate) {
    throw new HTTPException(400, {
      message: "The cycle end date cannot be before its start date",
    });
  }

  const [cycle] = await db
    .insert(cycleTable)
    .values({
      projectId,
      name: trimmed,
      goal: goal ?? null,
      startDate,
      endDate,
    })
    .returning();

  if (!cycle) {
    throw new HTTPException(500, { message: "Failed to create cycle" });
  }

  await publishEvent("cycle.changed", {
    projectId,
    cycleId: cycle.id,
    userId: currentUserId,
  });

  return cycle;
}

export default createCycle;
