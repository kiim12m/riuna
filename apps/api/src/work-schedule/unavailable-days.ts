import { and, between, eq, gte, inArray, lte } from "drizzle-orm";
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

type Window = { workspaceId: string; start: Date; end: Date };

/**
 * Los dias no disponibles de una persona dentro de una ventana, por
 * `yyyy-mm-dd`: los festivos del espacio y sus ausencias en el. La unica
 * fuente para el Planificador, el Cronograma y Hoy, que con esto dejan la
 * capacidad del dia a 0 (`capacityForDay`).
 */
export async function loadUnavailableDays({
  userId,
  ...window
}: Window & { userId: string }): Promise<Map<string, Unavailable>> {
  const byUser = await loadUnavailableDaysForUsers({
    ...window,
    userIds: [userId],
  });
  return byUser.get(userId) ?? new Map();
}

/**
 * `loadUnavailableDays` para varias personas en dos consultas, para la vista
 * del responsable (ADR 059): la misma regla, una sola vez.
 */
export async function loadUnavailableDaysForUsers({
  workspaceId,
  userIds,
  start,
  end,
}: Window & { userIds: string[] }): Promise<
  Map<string, Map<string, Unavailable>>
> {
  const byUser = new Map<string, Map<string, Unavailable>>(
    userIds.map((userId) => [userId, new Map()]),
  );
  // Sin esta salida, `inArray(col, [])` compila a `in ()`.
  if (userIds.length === 0) return byUser;

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
        userId: userTimeOffTable.userId,
        startsOn: userTimeOffTable.startsOn,
        endsOn: userTimeOffTable.endsOn,
      })
      .from(userTimeOffTable)
      .where(
        and(
          inArray(userTimeOffTable.userId, userIds),
          eq(userTimeOffTable.workspaceId, workspaceId),
          lte(userTimeOffTable.startsOn, end),
          gte(userTimeOffTable.endsOn, startOfServerDay(start)),
        ),
      ),
  ]);

  for (const range of ranges) {
    const days = byUser.get(range.userId);
    if (!days) continue;
    const from = startOfServerDay(
      range.startsOn > start ? range.startsOn : start,
    );
    const to = range.endsOn < end ? range.endsOn : end;
    for (const key of dayKeysBetween(from, to)) {
      days.set(key, { kind: "time-off", name: null });
    }
  }
  // Si coinciden, se ve el festivo: es lo que explica el dia a cualquiera.
  for (const days of byUser.values()) {
    for (const holiday of holidays) {
      days.set(serverDayKey(holiday.day), {
        kind: "holiday",
        name: holiday.name,
      });
    }
  }
  return byUser;
}
