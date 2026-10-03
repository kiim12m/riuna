import { and, asc, eq, gte } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { workspaceHolidayTable } from "../../database/schema";
import {
  addDays,
  parseServerDay,
  startOfServerDay,
} from "../../utils/day-boundaries";
import { isUniqueViolation } from "../../utils/is-unique-violation";

const columns = {
  id: workspaceHolidayTable.id,
  day: workspaceHolidayTable.day,
  name: workspaceHolidayTable.name,
};

/** Los festivos del espacio desde hace un mes: los pasados ya no se tocan. */
export async function listHolidays({
  workspaceId,
  now = new Date(),
}: {
  workspaceId: string;
  now?: Date;
}) {
  return db
    .select(columns)
    .from(workspaceHolidayTable)
    .where(
      and(
        eq(workspaceHolidayTable.workspaceId, workspaceId),
        gte(workspaceHolidayTable.day, addDays(startOfServerDay(now), -30)),
      ),
    )
    .orderBy(asc(workspaceHolidayTable.day));
}

export async function createHoliday({
  workspaceId,
  day,
  name,
}: {
  workspaceId: string;
  day: string;
  name: string;
}) {
  try {
    const [row] = await db
      .insert(workspaceHolidayTable)
      .values({
        workspaceId,
        day: parseServerDay(day, "day"),
        name: name.trim(),
      })
      .returning(columns);
    return row;
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new HTTPException(409, {
        message: "There is already a holiday on that day",
      });
    }
    throw error;
  }
}

export async function deleteHoliday({
  workspaceId,
  id,
}: {
  workspaceId: string;
  id: string;
}) {
  const [row] = await db
    .delete(workspaceHolidayTable)
    .where(
      and(
        eq(workspaceHolidayTable.id, id),
        eq(workspaceHolidayTable.workspaceId, workspaceId),
      ),
    )
    .returning({ id: workspaceHolidayTable.id });
  if (!row) {
    throw new HTTPException(404, { message: "Holiday not found" });
  }
  return row;
}
