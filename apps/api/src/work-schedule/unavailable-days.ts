import { and, between, eq, gte, lte } from "drizzle-orm";
import db from "../database";
import { userTimeOffTable, workspaceHolidayTable } from "../database/schema";
import {
  dayKeysBetween,
  serverDayKey,
  startOfServerDay,
} from "../utils/day-boundaries";

/**
 * Por que un dia no esta disponible (ADR 060): festivo, con su nombre, o
 * ausencia, **nunca con su nota** -la nota solo sale para su dueño, desde
 * `availability/`-.
 */
export type Unavailable = { kind: "holiday" | "time-off"; name: string | null };

/**
 * Los dias no disponibles de una persona dentro de una ventana, por
 * `yyyy-mm-dd`: los festivos del espacio y sus ausencias en el. La unica
 * fuente para el Planificador, el Cronograma y Hoy, que con esto dejan la
 * capacidad del dia a 0 (`capacityForDay`).
 */
export async function loadUnavailableDays({
  workspaceId,
  userId,
  start,
  end,
}: {
  workspaceId: string;
  userId: string;
  start: Date;
  end: Date;
}): Promise<Map<string, Unavailable>> {
  const [holidays, ranges] = await Promise.all([
    db
      .select({
        day: workspaceHolidayTable.day,
        name: workspaceHolidayTable.name,
      })
      .from(workspaceHolidayTable)
      .where(
        and(
          eq(workspaceHolidayTable.workspaceId, workspaceId),
          between(workspaceHolidayTable.day, start, end),
        ),
      ),
    db
      .select({
        startsOn: userTimeOffTable.startsOn,
        endsOn: userTimeOffTable.endsOn,
      })
      .from(userTimeOffTable)
      .where(
        and(
          eq(userTimeOffTable.userId, userId),
          eq(userTimeOffTable.workspaceId, workspaceId),
          lte(userTimeOffTable.startsOn, end),
          gte(userTimeOffTable.endsOn, startOfServerDay(start)),
        ),
      ),
  ]);

  const days = new Map<string, Unavailable>();
  for (const range of ranges) {
    const from = startOfServerDay(
      range.startsOn > start ? range.startsOn : start,
    );
    const to = range.endsOn < end ? range.endsOn : end;
    for (const key of dayKeysBetween(from, to)) {
      days.set(key, { kind: "time-off", name: null });
    }
  }
  // Si coinciden, se ve el festivo: es lo que explica el dia a cualquiera.
  for (const holiday of holidays) {
    days.set(serverDayKey(holiday.day), {
      kind: "holiday",
      name: holiday.name,
    });
  }
  return days;
}
