import { eq } from "drizzle-orm";
import db from "../../database";
import { workspaceHolidayTable } from "../../database/schema";
import { addDays, serverDayKey } from "../../utils/day-boundaries";
import type { DbOrTx } from "../controllers/assignees";

/**
 * El calendario laboral de un espacio para planificar (ADR 083 y 084): de
 * lunes a viernes, saltando los festivos del espacio. Es el mismo para todo
 * el mundo —no mira la jornada ni las ausencias de nadie—, asi que la misma
 * tarea se planifica siempre igual.
 *
 * Trabaja con dias del servidor: medianoche local, como se guardan las fechas
 * de una tarea (ADR 049).
 */
export class WorkCalendar {
  constructor(private readonly holidays: ReadonlySet<string> = new Set()) {}

  isWorkDay(day: Date): boolean {
    const weekday = day.getDay();
    return (
      weekday !== 0 && weekday !== 6 && !this.holidays.has(serverDayKey(day))
    );
  }

  /** El primer dia laborable despues de `day`. */
  nextWorkDay(day: Date): Date {
    let cursor = addDays(day, 1);
    while (!this.isWorkDay(cursor)) cursor = addDays(cursor, 1);
    return cursor;
  }

  /**
   * `days` dias laborables desde `day`, hacia delante o hacia atras. Con 0
   * devuelve el propio dia. Contando cada paso solo si cae en laborable, el
   * resultado siempre es laborable.
   */
  addWorkDays(day: Date, days: number): Date {
    let cursor = day;
    let remaining = Math.abs(days);
    const step = days < 0 ? -1 : 1;
    while (remaining > 0) {
      cursor = addDays(cursor, step);
      if (this.isWorkDay(cursor)) remaining -= 1;
    }
    return cursor;
  }

  /**
   * Cuantos dias laborables hay que mover `from` para llegar a `to`: positivo
   * hacia delante, negativo hacia atras. Soltar en un sabado cuenta hasta el
   * viernes.
   */
  workDaysToward(from: Date, to: Date): number {
    if (to > from) return this.workDaysBetween(addDays(from, 1), to);
    if (to < from) return -this.workDaysBetween(to, addDays(from, -1));
    return 0;
  }

  /** Los dias laborables entre dos dias, los dos incluidos. */
  workDaysBetween(from: Date, to: Date): number {
    if (to < from) return 0;
    let count = 0;
    for (let cursor = from; cursor <= to; cursor = addDays(cursor, 1)) {
      if (this.isWorkDay(cursor)) count += 1;
    }
    return count;
  }
}

export async function loadWorkCalendar(
  workspaceId: string,
  executor: DbOrTx = db,
): Promise<WorkCalendar> {
  const rows = await executor
    .select({ day: workspaceHolidayTable.day })
    .from(workspaceHolidayTable)
    .where(eq(workspaceHolidayTable.workspaceId, workspaceId));
  return new WorkCalendar(new Set(rows.map((row) => serverDayKey(row.day))));
}
