/**
 * El stand-up en texto, para el envio programado a un chat (ADR 068).
 *
 * **Es la segunda implementacion de esto.** La primera vive en la web
 * (`apps/web/src/lib/standup.ts`), que es la que copia la persona. No va a
 * `packages/libs` porque ese paquete depende de la API para los tipos del
 * cliente: la API no puede depender de el. La prueba de paridad
 * (`tests/api/automation/standup-text.test.ts`) es lo que impide que diverjan,
 * como con `buildFilter`.
 */

type StandupTask = {
  number: number | null;
  title: string;
  projectSlug: string;
  keyRank: number | null;
};

export type StandupData = {
  yesterday: { day: string; done: StandupTask[] };
  today: { day: string; planned: StandupTask[] };
  blockers: string | null;
};

export type StandupLabels = {
  yesterday: string;
  today: string;
  blockers: string;
  nothingDone: string;
  nothingPlanned: string;
  noBlockers: string;
  /** El dia como se lee: «jue, 1 oct». */
  day: (key: string) => string;
};

function line(task: StandupTask) {
  const key =
    task.number === null ? "" : ` (${task.projectSlug}-${task.number})`;
  return `- ${task.keyRank !== null ? "★ " : ""}${task.title}${key}`;
}

/** El stand-up de una persona en Markdown: la misma salida que en la web. */
export function standupMarkdown(data: StandupData, labels: StandupLabels) {
  const blockers = (data.blockers ?? "")
    .split("\n")
    .map((text) => text.trim())
    .filter(Boolean);

  return [
    `**${labels.yesterday}** · ${labels.day(data.yesterday.day)}`,
    ...(data.yesterday.done.length > 0
      ? data.yesterday.done.map(line)
      : [`- ${labels.nothingDone}`]),
    "",
    `**${labels.today}** · ${labels.day(data.today.day)}`,
    ...(data.today.planned.length > 0
      ? data.today.planned.map(line)
      : [`- ${labels.nothingPlanned}`]),
    "",
    `**${labels.blockers}**`,
    ...(blockers.length > 0
      ? blockers.map((text) => `- ${text}`)
      : [`- ${labels.noBlockers}`]),
  ].join("\n");
}

const DAY_FORMAT = new Intl.DateTimeFormat("es-ES", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

/**
 * Las etiquetas en castellano, las mismas que la web (`rituals.standup.*`).
 * El dia es un `yyyy-mm-dd` de Madrid: leido a mediodia UTC no cambia de dia.
 */
export const STANDUP_LABELS_ES: StandupLabels = {
  yesterday: "Ayer",
  today: "Hoy",
  blockers: "Bloqueos",
  nothingDone: "Nada terminado",
  nothingPlanned: "Nada planificado",
  noBlockers: "Ninguno",
  day: (key) => DAY_FORMAT.format(new Date(`${key}T12:00:00Z`)),
};
