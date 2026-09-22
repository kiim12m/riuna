/**
 * El reparto de un dia del Cronograma (ADR 041): version reducida del
 * algoritmo de solapes de `map-schedule-data` de super-productivity, portado
 * a dos tipos en vez de doce y sin acarreo entre dias — ver la ADR para el
 * porque de cada corte.
 */

export type FlowEntry = {
  taskId: string;
  /** Ya con el minimo de 10 min aplicado por quien llama. */
  estimateSeconds: number;
  /** Orden entre las que fluyen; ignorado si `pinnedStartSecond` no es nulo. */
  position: number;
  /** Ancla explicita (columna `start_minute`), en segundos desde medianoche. */
  pinnedStartSecond: number | null;
};

export type BlockerInput = {
  id: string;
  kind: "fixed" | "break" | "running";
  title: string;
  startSecond: number;
  endSecond: number;
};

export type MergedBlockEntry = {
  id: string;
  title: string;
  kind: BlockerInput["kind"];
};

export type LayoutSegment =
  | {
      type: "flow";
      taskId: string;
      startSecond: number;
      endSecond: number;
      part: number;
      truncated: boolean;
    }
  | {
      type: "pinned";
      taskId: string;
      startSecond: number;
      endSecond: number;
      conflict: boolean;
    }
  | {
      type: "block";
      startSecond: number;
      endSecond: number;
      entries: MergedBlockEntry[];
    };

export type OverflowEntry = { taskId: string; remainingSeconds: number };

export type DayLayout = {
  segments: LayoutSegment[];
  overflow: OverflowEntry[];
};

function mergeBlockers(
  blockers: BlockerInput[],
): { startSecond: number; endSecond: number; entries: MergedBlockEntry[] }[] {
  const sorted = [...blockers].sort((a, b) => a.startSecond - b.startSecond);
  const merged: {
    startSecond: number;
    endSecond: number;
    entries: MergedBlockEntry[];
  }[] = [];

  for (const blocker of sorted) {
    const last = merged[merged.length - 1];
    if (last && blocker.startSecond <= last.endSecond) {
      last.endSecond = Math.max(last.endSecond, blocker.endSecond);
      last.entries.push({
        id: blocker.id,
        title: blocker.title,
        kind: blocker.kind,
      });
    } else {
      merged.push({
        startSecond: blocker.startSecond,
        endSecond: blocker.endSecond,
        entries: [{ id: blocker.id, title: blocker.title, kind: blocker.kind }],
      });
    }
  }

  return merged;
}

const overlaps = (
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
): boolean => aStart < bEnd && aEnd > bStart;

/**
 * Reparte un dia: los bloques fijos y las entradas anclas (`start_minute`)
 * ocupan su hora tal cual; las que fluyen se colocan en orden de `position`
 * desde `dayStartSecond`, saltando lo ya ocupado y partiendose si un bloque
 * cae dentro. Lo que no cabe antes de `dayEndSecond` va a `overflow` —nunca
 * se arrastra al dia siguiente, ver ADR 041—.
 */
export function layoutDay(input: {
  flowEntries: FlowEntry[];
  blockers: BlockerInput[];
  dayStartSecond: number;
  dayEndSecond: number;
}): DayLayout {
  const { flowEntries, blockers, dayStartSecond, dayEndSecond } = input;

  const pinned = flowEntries.filter(
    (entry) => entry.pinnedStartSecond !== null,
  );
  const flowing = flowEntries
    .filter((entry) => entry.pinnedStartSecond === null)
    .sort((a, b) => a.position - b.position);

  const mergedBlocks = mergeBlockers(blockers);

  const pinnedSegments: LayoutSegment[] = pinned.map((entry) => {
    const start = entry.pinnedStartSecond as number;
    const end = start + entry.estimateSeconds;
    const conflict =
      mergedBlocks.some((block) =>
        overlaps(start, end, block.startSecond, block.endSecond),
      ) ||
      pinned.some((other) => {
        if (other === entry) return false;
        const otherStart = other.pinnedStartSecond as number;
        return overlaps(
          start,
          end,
          otherStart,
          otherStart + other.estimateSeconds,
        );
      });
    return {
      type: "pinned",
      taskId: entry.taskId,
      startSecond: start,
      endSecond: end,
      conflict,
    };
  });

  const occupied = [
    ...mergedBlocks.map((block) => ({
      start: block.startSecond,
      end: block.endSecond,
    })),
    ...pinned.map((entry) => ({
      start: entry.pinnedStartSecond as number,
      end: (entry.pinnedStartSecond as number) + entry.estimateSeconds,
    })),
  ].sort((a, b) => a.start - b.start);

  const flowSegments: LayoutSegment[] = [];
  const overflow: OverflowEntry[] = [];
  let cursor = dayStartSecond;
  let occIndex = 0;

  for (const entry of flowing) {
    let remaining = entry.estimateSeconds;
    let part = 0;
    let lastSegment: Extract<LayoutSegment, { type: "flow" }> | null = null;

    while (
      occIndex < occupied.length &&
      (occupied[occIndex]?.end ?? 0) <= cursor
    ) {
      occIndex++;
    }

    while (remaining > 0) {
      const blocking = occupied[occIndex];
      if (blocking && blocking.start <= cursor) {
        cursor = blocking.end;
        occIndex++;
        continue;
      }

      if (cursor >= dayEndSecond) {
        overflow.push({ taskId: entry.taskId, remainingSeconds: remaining });
        if (lastSegment) lastSegment.truncated = true;
        remaining = 0;
        break;
      }

      const boundary = Math.min(
        blocking ? blocking.start : dayEndSecond,
        dayEndSecond,
      );
      const take = Math.min(remaining, boundary - cursor);
      const segment: Extract<LayoutSegment, { type: "flow" }> = {
        type: "flow",
        taskId: entry.taskId,
        startSecond: cursor,
        endSecond: cursor + take,
        part,
        truncated: false,
      };
      flowSegments.push(segment);
      lastSegment = segment;
      cursor += take;
      remaining -= take;
      part++;
    }
  }

  const blockSegments: LayoutSegment[] = mergedBlocks.map((block) => ({
    type: "block",
    startSecond: block.startSecond,
    endSecond: block.endSecond,
    entries: block.entries,
  }));

  const segments = [...blockSegments, ...pinnedSegments, ...flowSegments].sort(
    (a, b) => a.startSecond - b.startSecond,
  );

  return { segments, overflow };
}
