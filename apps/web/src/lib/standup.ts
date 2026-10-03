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

/**
 * El stand-up en Markdown, para pegarlo donde el equipo lo comparta
 * (sub-bloque 2.4). Lo arma el cliente con sus etiquetas traducidas: la API
 * da los datos y la vista del responsable (5.3) pintara los mismos.
 */
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
