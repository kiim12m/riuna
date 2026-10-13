import type { WorkCalendar } from "./work-calendar";

/**
 * El nucleo de la planificacion automatica (ADR 083 y 084), puro: recibe el
 * proyecto en memoria y devuelve que tareas cambian. Sin base de datos para
 * poder probar cada regla por separado.
 */

export type ScheduleTask = {
  id: string;
  parentId: string | null;
  startDate: Date | null;
  dueDate: Date | null;
  autoDates: boolean;
  isMilestone: boolean;
  archived: boolean;
};

export type Precedence = {
  predecessorId: string;
  successorId: string;
  /** Dias laborables de desfase; negativo para solapar. */
  lag: number;
};

export type ScheduleChange = {
  id: string;
  before: Pick<ScheduleTask, "startDate" | "dueDate" | "autoDates">;
  after: Pick<ScheduleTask, "startDate" | "dueDate" | "autoDates">;
};

export class ScheduleCycleError extends Error {
  constructor() {
    super("The schedule does not converge: there is a cycle");
  }
}

const same = (a: Date | null, b: Date | null) =>
  (a?.getTime() ?? null) === (b?.getTime() ?? null);

export function computeSchedule({
  tasks,
  precedences = [],
  calendar,
  seeds,
}: {
  tasks: ScheduleTask[];
  precedences?: Precedence[];
  calendar: WorkCalendar;
  seeds: string[];
}): ScheduleChange[] {
  const current = new Map(tasks.map((task) => [task.id, { ...task }]));
  const children = new Map<string, string[]>();
  for (const task of tasks) {
    if (!task.parentId || task.archived) continue;
    const list = children.get(task.parentId) ?? [];
    list.push(task.id);
    children.set(task.parentId, list);
  }
  const predecessorsOf = new Map<string, Precedence[]>();
  const successorsOf = new Map<string, string[]>();
  for (const precedence of precedences) {
    if (!current.has(precedence.predecessorId)) continue;
    if (!current.has(precedence.successorId)) continue;
    const preds = predecessorsOf.get(precedence.successorId) ?? [];
    preds.push(precedence);
    predecessorsOf.set(precedence.successorId, preds);
    const succs = successorsOf.get(precedence.predecessorId) ?? [];
    succs.push(precedence.successorId);
    successorsOf.set(precedence.predecessorId, succs);
  }

  /**
   * Inicio y fin de toda la rama por debajo, sin la propia tarea. Se compone
   * de los tramos de las hijas y se guarda: recorrer la rama entera en cada
   * evaluacion de cada ancestro convertia una cadena de doscientas sucesoras
   * en cientos de miles de visitas. Cambiar una tarea solo invalida a sus
   * ancestros.
   */
  type Span = { start: Date | null; due: Date | null };
  const spans = new Map<string, Span>();
  const branchSpan = (id: string): Span => {
    const cached = spans.get(id);
    if (cached) return cached;
    let start: Date | null = null;
    let due: Date | null = null;
    for (const childId of children.get(id) ?? []) {
      const child = current.get(childId);
      if (!child) continue;
      const below = branchSpan(childId);
      for (const candidate of [child.startDate ?? child.dueDate, below.start]) {
        if (candidate && (!start || candidate < start)) start = candidate;
      }
      for (const candidate of [child.dueDate ?? child.startDate, below.due]) {
        if (candidate && (!due || candidate > due)) due = candidate;
      }
    }
    const span = { start, due };
    spans.set(id, span);
    return span;
  };

  /** Lo que la tarea deberia tener, segun sus hijas o sus predecesoras. */
  const desired = (task: ScheduleTask) => {
    const hasChildren = (children.get(task.id)?.length ?? 0) > 0;
    if (hasChildren) {
      // Un padre sin ninguna fecha propia pasa solo a automaticas.
      const autoDates =
        task.autoDates || (task.startDate === null && task.dueDate === null);
      if (!autoDates) return { ...task };
      const span = branchSpan(task.id);
      return { ...task, autoDates, startDate: span.start, dueDate: span.due };
    }

    const preds = predecessorsOf.get(task.id) ?? [];
    if (!task.autoDates || preds.length === 0) return { ...task };

    // Atada a sus predecesoras: empieza el dia laborable siguiente al fin de
    // la ultima, mas el desfase (ADR 084).
    let start: Date | null = null;
    for (const precedence of preds) {
      const pred = current.get(precedence.predecessorId);
      const end = pred?.dueDate ?? pred?.startDate ?? null;
      if (!end) continue;
      const candidate = calendar.addWorkDays(
        calendar.nextWorkDay(end),
        precedence.lag,
      );
      if (!start || candidate > start) start = candidate;
    }
    if (!start) return { ...task };

    if (task.isMilestone) return { ...task, startDate: start, dueDate: start };
    if (task.startDate && task.dueDate) {
      const length = Math.max(
        1,
        calendar.workDaysBetween(task.startDate, task.dueDate),
      );
      return {
        ...task,
        startDate: start,
        dueDate: calendar.addWorkDays(start, length - 1),
      };
    }
    // Con una sola fecha es una tarea de un dia: se mueve esa.
    return task.dueDate && !task.startDate
      ? { ...task, dueDate: start }
      : { ...task, startDate: start };
  };

  const queue: string[] = [];
  const queued = new Set<string>();
  const enqueue = (id: string | null | undefined) => {
    if (!id || queued.has(id) || !current.has(id)) return;
    queued.add(id);
    queue.push(id);
  };
  // El tramo de una rama mira a todos sus descendientes, asi que un cambio
  // despierta a toda la cadena de ancestros y no solo al padre.
  const enqueueAncestors = (id: string) => {
    let parentId = current.get(id)?.parentId ?? null;
    const seen = new Set<string>();
    while (parentId && !seen.has(parentId)) {
      seen.add(parentId);
      enqueue(parentId);
      parentId = current.get(parentId)?.parentId ?? null;
    }
  };
  // Los tramos que incluyen a una tarea son los de sus ancestros.
  const invalidateAncestors = (id: string) => {
    let parentId = current.get(id)?.parentId ?? null;
    const seen = new Set<string>();
    while (parentId && !seen.has(parentId)) {
      seen.add(parentId);
      spans.delete(parentId);
      parentId = current.get(parentId)?.parentId ?? null;
    }
  };
  for (const seed of seeds) {
    enqueue(seed);
    enqueueAncestors(seed);
    for (const successor of successorsOf.get(seed) ?? []) enqueue(successor);
  }

  let steps = 0;
  const maxSteps = (tasks.length + 1) * 20;
  while (queue.length > 0) {
    steps += 1;
    if (steps > maxSteps) throw new ScheduleCycleError();
    const id = queue.shift() as string;
    queued.delete(id);
    const task = current.get(id);
    if (!task || task.archived) continue;

    const next = desired(task);
    if (
      same(next.startDate, task.startDate) &&
      same(next.dueDate, task.dueDate) &&
      next.autoDates === task.autoDates
    ) {
      continue;
    }
    current.set(id, next);
    invalidateAncestors(id);
    enqueueAncestors(id);
    for (const successor of successorsOf.get(id) ?? []) enqueue(successor);
  }

  const changes: ScheduleChange[] = [];
  for (const original of tasks) {
    const final = current.get(original.id);
    if (!final) continue;
    if (
      same(final.startDate, original.startDate) &&
      same(final.dueDate, original.dueDate) &&
      final.autoDates === original.autoDates
    ) {
      continue;
    }
    changes.push({
      id: original.id,
      before: {
        startDate: original.startDate,
        dueDate: original.dueDate,
        autoDates: original.autoDates,
      },
      after: {
        startDate: final.startDate,
        dueDate: final.dueDate,
        autoDates: final.autoDates,
      },
    });
  }
  return changes;
}
