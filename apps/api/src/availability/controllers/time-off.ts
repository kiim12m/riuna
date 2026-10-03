import { and, asc, eq, gte } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { userTimeOffTable } from "../../database/schema";
import {
  addDays,
  parseServerDay,
  startOfServerDay,
} from "../../utils/day-boundaries";

/** Una ausencia no pasa de un año: acota lo que se expande dia a dia. */
const MAX_DAYS = 366;

const columns = {
  id: userTimeOffTable.id,
  startsOn: userTimeOffTable.startsOn,
  endsOn: userTimeOffTable.endsOn,
  note: userTimeOffTable.note,
};

type Scope = { workspaceId: string; userId: string };

/**
 * Las ausencias de quien mira en un espacio que aun no han acabado, con su
 * nota: este es el unico sitio por donde sale (ADR 060).
 */
export async function listTimeOff({
  workspaceId,
  userId,
  now = new Date(),
}: Scope & { now?: Date }) {
  return db
    .select(columns)
    .from(userTimeOffTable)
    .where(
      and(
        eq(userTimeOffTable.workspaceId, workspaceId),
        eq(userTimeOffTable.userId, userId),
        gte(userTimeOffTable.endsOn, startOfServerDay(now)),
      ),
    )
    .orderBy(asc(userTimeOffTable.startsOn));
}

export async function createTimeOff({
  workspaceId,
  userId,
  startsOn,
  endsOn,
  note,
}: Scope & { startsOn: string; endsOn: string; note: string | null }) {
  const start = parseServerDay(startsOn, "startsOn");
  const end = parseServerDay(endsOn, "endsOn");
  if (end < start) {
    throw new HTTPException(400, {
      message: "endsOn must be on or after startsOn",
    });
  }
  if (end > addDays(start, MAX_DAYS - 1)) {
    throw new HTTPException(400, {
      message: `An absence cannot be longer than ${MAX_DAYS} days`,
    });
  }

  const [row] = await db
    .insert(userTimeOffTable)
    .values({
      workspaceId,
      userId,
      startsOn: start,
      endsOn: end,
      note: note?.trim() || null,
    })
    .returning(columns);
  return row;
}

/** Solo las propias: la de otra persona, o de otro espacio, es un 404. */
export async function deleteTimeOff({
  workspaceId,
  userId,
  id,
}: Scope & { id: string }) {
  const [row] = await db
    .delete(userTimeOffTable)
    .where(
      and(
        eq(userTimeOffTable.id, id),
        eq(userTimeOffTable.workspaceId, workspaceId),
        eq(userTimeOffTable.userId, userId),
      ),
    )
    .returning({ id: userTimeOffTable.id });
  if (!row) {
    throw new HTTPException(404, { message: "Absence not found" });
  }
  return row;
}
