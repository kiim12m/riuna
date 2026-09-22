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
}: {
  workspaceId: string;
  userId: string;
  title: string;
  kind: "fixed" | "break";
  startMinute: number;
  endMinute: number;
  plannedDate: Date | null;
  cadence: Cadence | null;
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
    })
    .returning();

  await publishEvent("schedule.changed", { userId });

  return block;
}
