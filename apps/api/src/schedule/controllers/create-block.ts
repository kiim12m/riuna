import db from "../../database";
import { scheduleBlockTable } from "../../database/schema";
import { publishEvent } from "../../events";
import type { Cadence } from "../../recurrence/cadence";

export default async function createBlock({
  workspaceId,
  userId,
  title,
  kind,
  startMinute,
  endMinute,
  plannedDate,
  cadence,
  endsAt,
}: {
  workspaceId: string;
  userId: string;
  title: string;
  kind: "fixed" | "break";
  startMinute: number;
  endMinute: number;
  plannedDate: Date | null;
  cadence: Cadence | null;
  /** Solo tiene sentido junto a `cadence`; quien llama ya lo comprueba. */
  endsAt: Date | null;
}) {
  const [block] = await db
    .insert(scheduleBlockTable)
    .values({
      workspaceId,
      userId,
      title,
      kind,
      startMinute,
      endMinute,
      plannedDate,
      cadence,
      endsAt,
    })
    .returning();

  await publishEvent("schedule.changed", { userId });

  return block;
}
