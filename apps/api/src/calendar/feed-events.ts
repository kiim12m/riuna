import { and, between, eq, isNotNull, isNull, ne, type SQL } from "drizzle-orm";
import db from "../database";
import {
  personalPlanEntryTable,
  projectTable,
  taskTable,
} from "../database/schema";
import {
  getWorkspaceColumns,
  LEGACY_FINAL_STATUS,
  notDoneCondition,
} from "../my-work/decorate";
import { assignedCondition } from "../my-work/scope";
import { getEntriesInRange } from "../planner/queries";
import {
  type Cadence,
  firstOnOrAfter,
  parseCadence,
} from "../recurrence/cadence";
import {
  type BlocksByDay,
  loadBlocksByDay,
  type ScheduleBlockRow,
} from "../schedule/blocks-by-day";
import {
  MIN_ENTRY_DURATION_SECONDS,
  UNESTIMATED_ENTRY_SECONDS,
} from "../schedule/constants";
import {
  addDays,
  endOfServerDay,
  parseServerDay,
  serverDayKey,
  serverTimeZone,
  startOfServerDay,
} from "../utils/day-boundaries";
import {
  cadenceRrule,
  ICS_TIME_ZONE,
  type IcsEvent,
  type LocalDateTime,
  writeCalendar,
} from "./ics-writer";

/** La ventana del feed (ADR 057): un mes atras y tres adelante. */
export function feedWindow(now: Date) {
  return {
    start: addDays(startOfServerDay(now), -30),
    end: endOfServerDay(addDays(now, 90)),
  };
}

/** `day` (una fecha a cualquier hora) a `minute` minutos de su medianoche. */
function atMinute(day: Date, minute: number): Date {
  const at = new Date(day);
  at.setHours(0, minute, 0, 0);
  return at;
}

function localOf(date: Date): LocalDateTime {
  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
    hour: date.getHours(),
    minute: date.getMinutes(),
  };
}

/**
 * Un bloque repetido como una sola serie, desde el dia en que se creo, o
 * `null` si su cadencia no se puede escribir como `RRULE` (`cadenceRrule`).
 * Sin ninguna ocurrencia -acabo antes de empezar-, una lista vacia.
 */
function seriesOf(
  block: ScheduleBlockRow,
  cadence: Cadence,
): IcsEvent[] | null {
  const until = block.endsAt ? endOfServerDay(block.endsAt) : null;
  const rrule = cadenceRrule(cadence, until);
  if (!rrule) return null;
  const first = firstOnOrAfter(cadence, block.createdAt);
  if (until && first > until) return [];
  return [
    {
      kind: "series",
      uid: `riuna-block-${block.id}`,
      summary: block.title,
      start: localOf(atMinute(first, block.startMinute)),
      end: localOf(atMinute(first, block.endMinute)),
      rrule,
    },
  ];
}

/**
 * Los bloques del Cronograma como eventos. Los repetidos van como serie
 * cuando se puede y `series` lo permite -la hora de pared de la serie es la
 * del servidor, asi que solo con la API en Madrid-; si no, ocurrencia a
 * ocurrencia, proyectados igual que en el Cronograma. Una cadencia mal
 * formada se salta, como alli.
 */
export function blockEvents(
  { blocksByDay, blocksById }: BlocksByDay,
  { series }: { series: boolean },
): IcsEvent[] {
  const events: IcsEvent[] = [];
  const asSeries = new Set<string>();

  if (series) {
    for (const block of blocksById.values()) {
      if (!block.cadence) continue;
      let cadence: Cadence;
      try {
        cadence = parseCadence(block.cadence);
      } catch {
        continue;
      }
      const seriesEvents = seriesOf(block, cadence);
      if (seriesEvents === null) continue;
      asSeries.add(block.id);
      events.push(...seriesEvents);
    }
  }

  for (const [dayKey, blocks] of blocksByDay) {
    const day = parseServerDay(dayKey, "day");
    for (const block of blocks) {
      if (asSeries.has(block.id)) continue;
      events.push({
        kind: "timed",
        uid: block.cadence
          ? `riuna-block-${block.id}-${dayKey}`
          : `riuna-block-${block.id}`,
        summary: block.title,
        start: atMinute(day, block.startMinute),
        end: atMinute(day, block.endMinute),
      });
    }
  }

  return events;
}

const DUE_PREFIX = { es: "Vence", en: "Due" };

/**
 * El calendario de una persona en un espacio (ADR 057): el plan con hora,
 * los bloques y los vencimientos de lo asignado sin terminar.
 */
export async function buildCalendar({
  workspaceId,
  userId,
  name,
  locale,
  now = new Date(),
}: {
  workspaceId: string;
  userId: string;
  name: string;
  locale: string | null;
  now?: Date;
}): Promise<string> {
  const window = feedWindow(now);
  const projectColumns = await getWorkspaceColumns(workspaceId);

  const dueConditions: SQL[] = [
    eq(projectTable.workspaceId, workspaceId),
    isNull(projectTable.archivedAt),
    ne(taskTable.status, "archived"),
    assignedCondition(userId),
    between(taskTable.dueDate, window.start, window.end),
  ];
  const notDone = notDoneCondition(projectColumns);
  if (notDone) dueConditions.push(notDone);

  const [entries, blocks, dueTasks] = await Promise.all([
    getEntriesInRange(workspaceId, userId, window.start, window.end, [
      isNotNull(personalPlanEntryTable.startMinute),
    ]),
    loadBlocksByDay(workspaceId, userId, window.start, window.end),
    db
      .select({
        id: taskTable.id,
        title: taskTable.title,
        dueDate: taskTable.dueDate,
        projectName: projectTable.name,
      })
      .from(taskTable)
      .innerJoin(projectTable, eq(taskTable.projectId, projectTable.id))
      .where(and(...dueConditions)),
  ]);

  const events: IcsEvent[] = [];

  for (const entry of entries) {
    if (entry.startMinute === null) continue;
    const start = atMinute(entry.plannedDate, entry.startMinute);
    // El mismo tamaño que le da el Cronograma (`build-day.ts`).
    const seconds =
      entry.estimate == null
        ? UNESTIMATED_ENTRY_SECONDS
        : Math.max(entry.estimate, MIN_ENTRY_DURATION_SECONDS);
    const isDone =
      projectColumns.get(entry.projectId)?.finals.includes(entry.status) ??
      entry.status === LEGACY_FINAL_STATUS;
    events.push({
      kind: "timed",
      uid: `riuna-plan-${entry.id}`,
      summary: isDone ? `✓ ${entry.title}` : entry.title,
      description: entry.projectName,
      start,
      end: new Date(start.getTime() + seconds * 1000),
    });
  }

  events.push(
    ...blockEvents(blocks, { series: serverTimeZone() === ICS_TIME_ZONE }),
  );

  const prefix = locale?.startsWith("en") ? DUE_PREFIX.en : DUE_PREFIX.es;
  for (const task of dueTasks) {
    if (!task.dueDate) continue;
    events.push({
      kind: "all-day",
      uid: `riuna-due-${task.id}`,
      summary: `${prefix}: ${task.title}`,
      description: task.projectName,
      day: serverDayKey(task.dueDate),
    });
  }

  return writeCalendar({ name, events, now });
}
