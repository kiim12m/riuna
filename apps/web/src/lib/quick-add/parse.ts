import { parseDurationInput } from "@/lib/duration";

/**
 * Captura rapida (ADR 052): una linea de texto en una tarea. El vocabulario es
 * cerrado y en castellano -sin `chrono` ni lenguaje natural-, asi que lo que
 * se escribe es lo que se obtiene, y lo que no casa se queda en el titulo:
 *
 * - `1h`, `30m`, `1h30`, `1,5h`, `90min`: estimacion (se suman).
 * - `@hoy`, `@mañana`, `@pasado`, `@lun`…`@dom`, `@15/10`: el dia del **plan**,
 *   nunca el vencimiento. Un `10:00` justo detras ancla la hora; `@10:00`
 *   solo es hoy a esa hora.
 * - `!hoy`, `!mañana`, `!vie`, `!15/10`: el vencimiento.
 * - `#etiqueta`: una etiqueta que ya existe; los espacios del nombre se
 *   escriben con `-`.
 * - `+CLAVE`: el proyecto con esa clave. Sin el, la Bandeja.
 * - `*urgente`, `*alta`, `*media`, `*baja` (o `*u`, `*a`, `*m`, `*b`).
 * - `\` delante de una palabra la deja tal cual en el titulo.
 *
 * Un dia de la semana es el **proximo**: `@lun` en lunes es el de la semana
 * que viene; para hoy esta `@hoy`. Una fecha sin año es la proxima vez que
 * llega: `@3/1` en octubre es enero del año que viene.
 */

export type QuickAddPriority = "urgent" | "high" | "medium" | "low";

export type QuickAddContext = {
  /** Hoy, en la zona del navegador (que es la de la instancia, ADR 049). */
  today: Date;
  /** Las etiquetas del espacio, sin las copias que cuelgan de una tarea. */
  labels: ReadonlyArray<{ id: string; name: string }>;
  /** Los proyectos que salen en las listas: la Bandeja no tiene clave que escribir. */
  projects: ReadonlyArray<{ id: string; slug: string; name: string }>;
};

export type QuickAddResult = {
  title: string;
  /** Segundos, como `task.estimate`. */
  estimate: number | null;
  /** `yyyy-mm-dd` del plan personal. */
  plannedDate: string | null;
  startMinute: number | null;
  /** `yyyy-mm-dd` del vencimiento. */
  dueDate: string | null;
  labels: Array<{ id: string; name: string }>;
  project: { id: string; slug: string; name: string } | null;
  priority: QuickAddPriority | null;
};

const PRIORITIES: Record<string, QuickAddPriority> = {
  urgente: "urgent",
  u: "urgent",
  alta: "high",
  a: "high",
  media: "medium",
  m: "medium",
  baja: "low",
  b: "low",
};

/** getDay(): 0 domingo … 6 sabado. */
const WEEKDAYS: Record<string, number> = {
  dom: 0,
  domingo: 0,
  lun: 1,
  lunes: 1,
  mar: 2,
  martes: 2,
  mie: 3,
  miercoles: 3,
  jue: 4,
  jueves: 4,
  vie: 5,
  viernes: 5,
  sab: 6,
  sabado: 6,
};

const RELATIVE_DAYS: Record<string, number> = {
  hoy: 0,
  manana: 1,
  pasado: 2,
};

const DURATION_TOKEN = /^(?:\d+(?:[.,]\d+)?h(?:\d{1,2}m?)?|\d+m(?:in)?)$/i;
const TIME_TOKEN = /^([01]?\d|2[0-3]):([0-5]\d)$/;
const DATE_TOKEN = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?$/;

/** Minusculas y sin tildes: `Mañana` y `manana` son lo mismo. */
function fold(text: string) {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

export function quickAddDayKey(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/** El dia que nombra `word` (sin `@` ni `!`), o `null` si no nombra ninguno. */
function resolveDay(word: string, today: Date): Date | null {
  const folded = fold(word);
  const base = startOfDay(today);

  if (folded in RELATIVE_DAYS) return addDays(base, RELATIVE_DAYS[folded]);

  if (folded in WEEKDAYS) {
    const ahead = (WEEKDAYS[folded] - base.getDay() + 7) % 7 || 7;
    return addDays(base, ahead);
  }

  const date = DATE_TOKEN.exec(word);
  if (!date) return null;

  const day = Number(date[1]);
  const month = Number(date[2]) - 1;
  const explicitYear = date[3]
    ? Number(date[3].length === 2 ? `20${date[3]}` : date[3])
    : null;
  const year = explicitYear ?? base.getFullYear();
  let candidate = new Date(year, month, day);
  // `31/2` no existe: `Date` lo desbordaria a marzo.
  if (candidate.getMonth() !== month || candidate.getDate() !== day) {
    return null;
  }
  if (explicitYear === null && candidate < base) {
    candidate = new Date(year + 1, month, day);
    if (candidate.getMonth() !== month) return null;
  }
  return candidate;
}

function parseTime(word: string) {
  const time = TIME_TOKEN.exec(word);
  return time ? Number(time[1]) * 60 + Number(time[2]) : null;
}

/** Los espacios de un nombre se escriben con `-` o `_`. */
function labelKey(name: string) {
  return fold(name).replace(/[\s_]+/g, "-");
}

export function parseQuickAdd(
  input: string,
  context: QuickAddContext,
): QuickAddResult {
  const words = input.trim().split(/\s+/).filter(Boolean);
  const title: string[] = [];
  const result: QuickAddResult = {
    title: "",
    estimate: null,
    plannedDate: null,
    startMinute: null,
    dueDate: null,
    labels: [],
    project: null,
    priority: null,
  };

  for (let index = 0; index < words.length; index++) {
    const word = words[index];
    const sigil = word[0];
    const rest = word.slice(1);

    if (sigil === "\\" && rest) {
      title.push(rest);
      continue;
    }

    if (sigil === "@" && rest) {
      const time = parseTime(rest);
      if (time !== null) {
        result.plannedDate = quickAddDayKey(context.today);
        result.startMinute = time;
        continue;
      }
      const day = resolveDay(rest, context.today);
      if (day) {
        result.plannedDate = quickAddDayKey(day);
        const next = words[index + 1];
        const anchored = next ? parseTime(next) : null;
        result.startMinute = anchored;
        if (anchored !== null) index++;
        continue;
      }
    }

    if (sigil === "!" && rest) {
      const day = resolveDay(rest, context.today);
      if (day) {
        result.dueDate = quickAddDayKey(day);
        continue;
      }
    }

    if (sigil === "#" && rest) {
      const label = context.labels.find(
        (candidate) => labelKey(candidate.name) === labelKey(rest),
      );
      if (label) {
        if (!result.labels.some((picked) => picked.id === label.id)) {
          result.labels.push({ id: label.id, name: label.name });
        }
        continue;
      }
    }

    if (sigil === "+" && rest) {
      const project = context.projects.find(
        (candidate) => fold(candidate.slug) === fold(rest),
      );
      if (project) {
        result.project = {
          id: project.id,
          slug: project.slug,
          name: project.name,
        };
        continue;
      }
    }

    if (sigil === "*" && rest) {
      const priority = PRIORITIES[fold(rest)];
      if (priority) {
        result.priority = priority;
        continue;
      }
    }

    if (DURATION_TOKEN.test(word)) {
      const seconds = parseDurationInput(word);
      if (typeof seconds === "number" && seconds > 0) {
        result.estimate = (result.estimate ?? 0) + seconds;
        continue;
      }
    }

    title.push(word);
  }

  result.title = title.join(" ");
  return result;
}
