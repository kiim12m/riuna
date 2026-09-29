import {
  firstOnOrAfter,
  nextOccurrence,
  parseCadence,
} from "../recurrence/cadence";
import { serverDayKey } from "../utils/day-boundaries";
import {
  MIN_ENTRY_DURATION_SECONDS,
  UNESTIMATED_ENTRY_SECONDS,
  WORK_END_MINUTE,
  WORK_START_MINUTE,
} from "./constants";
import { type BlockerInput, type FlowEntry, layoutDay } from "./layout";

const secondsSinceMidnight = (date: Date): number =>
  date.getHours() * 3600 + date.getMinutes() * 60 + date.getSeconds();

/**
 * Proyecta los bloques repetidos sobre `blocksByDay`, igual que los fantasmas
 * del Planificador: nunca se guarda una fila por ocurrencia, y `endsAt` -si
 * lo hay- recorta la ventana igual que `endsAt` en `computeGhosts`. Muta
 * `blocksByDay` en vez de devolver uno nuevo -mismo idioma que ya usa
 * `getSchedule` para construir sus otros mapas por dia-.
 */
export function projectRepeatingBlocks<
  Block extends {
    cadence: Record<string, unknown> | null;
    endsAt: Date | null;
  },
>(
  repeatingBlocks: Block[],
  blocksByDay: Map<string, Block[]>,
  windowStart: Date,
  windowEnd: Date,
): void {
  for (const block of repeatingBlocks) {
    if (!block.cadence) continue;
    try {
      const cadence = parseCadence(block.cadence);
      const projectionEnd =
        block.endsAt && block.endsAt < windowEnd ? block.endsAt : windowEnd;
      let cursor = firstOnOrAfter(cadence, windowStart);
      while (cursor <= projectionEnd) {
        const key = serverDayKey(cursor);
        const list = blocksByDay.get(key) ?? [];
        list.push(block);
        blocksByDay.set(key, list);
        cursor = nextOccurrence(cadence, cursor);
      }
    } catch {
      // Fila corrupta: se ignora en vez de tumbar el Cronograma entero.
    }
  }
}

type PlanEntry = {
  id: string;
  estimate: number | null;
  position: number;
  startMinute: number | null;
};

type BlockRow = {
  id: string;
  kind: string;
  title: string;
  startMinute: number;
  endMinute: number;
};

type RunningEntry = { id: string; startTime: Date };

/**
 * El reparto de un solo dia del Cronograma: entradas del plan mas bloques
 * fijos mas -si es hoy- el cronometro en marcha, pasados por `layoutDay`, y
 * decorados con la tarea/bloque real de cada tramo. Generica en las formas
 * exactas de fila (`Entry`/`Block`/`Ghost`) para no acoplarse a las columnas
 * que elija `getSchedule`: es la unica parte de la funcion que de verdad hace
 * falta poder leer y probar aislada del resto (consultas, agrupar por dia).
 */
export function buildDay<
  Entry extends PlanEntry,
  Block extends BlockRow,
  Ghost,
>(
  dayKey: string,
  {
    entriesByDay,
    blocksByDay,
    ghostsByDay,
    taskById,
    blockById,
    runningEntry,
    now,
    todayKey,
  }: {
    entriesByDay: Map<string, Entry[]>;
    blocksByDay: Map<string, Block[]>;
    ghostsByDay: Map<string, Ghost[]>;
    taskById: Map<string, Entry>;
    blockById: Map<string, Block>;
    runningEntry: RunningEntry | undefined;
    now: Date;
    todayKey: string;
  },
) {
  const dayEntries = entriesByDay.get(dayKey) ?? [];
  const dayBlocks = blocksByDay.get(dayKey) ?? [];
  const isToday = dayKey === todayKey;

  const flowEntries: FlowEntry[] = dayEntries.map((entry) => ({
    taskId: entry.id,
    estimateSeconds: entry.estimate
      ? Math.max(entry.estimate, MIN_ENTRY_DURATION_SECONDS)
      : UNESTIMATED_ENTRY_SECONDS,
    position: entry.position,
    pinnedStartSecond:
      entry.startMinute === null ? null : entry.startMinute * 60,
  }));

  const blockers: BlockerInput[] = dayBlocks.map((block) => ({
    id: block.id,
    kind: block.kind as "fixed" | "break",
    title: block.title,
    startSecond: block.startMinute * 60,
    endSecond: block.endMinute * 60,
  }));

  if (isToday && runningEntry) {
    blockers.push({
      id: runningEntry.id,
      kind: "running",
      title: "",
      startSecond: secondsSinceMidnight(runningEntry.startTime),
      endSecond: secondsSinceMidnight(now),
    });
  }

  const dayStartSecond = isToday
    ? Math.max(WORK_START_MINUTE * 60, secondsSinceMidnight(now))
    : WORK_START_MINUTE * 60;

  const layout = layoutDay({
    flowEntries,
    blockers,
    dayStartSecond,
    dayEndSecond: WORK_END_MINUTE * 60,
  });

  return {
    dayDate: dayKey,
    isToday,
    segments: layout.segments.map((segment) =>
      segment.type === "block"
        ? {
            ...segment,
            entries: segment.entries.map((entry) => ({
              ...entry,
              // El cronometro en marcha no es una fila de verdad -se
              // proyecta desde `time_entry`-, asi que no hay nada que
              // editar en el.
              block:
                entry.kind === "running"
                  ? null
                  : (blockById.get(entry.id) ?? null),
            })),
          }
        : { ...segment, task: taskById.get(segment.taskId) ?? null },
    ),
    overflow: layout.overflow.map((entry) => ({
      ...entry,
      task: taskById.get(entry.taskId) ?? null,
    })),
    ghosts: ghostsByDay.get(dayKey) ?? [],
  };
}
