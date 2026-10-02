export type AnchoredEntry = {
  id: string;
  title: string;
  /** ISO del instante de la hora anclada, calculado por la API (ADR 055). */
  startsAt: string | null;
  isDone: boolean;
};

export type DueReminder = {
  /** Clave unica del aviso: cada hora anclada, y cada posposicion, una vez. */
  key: string;
  entry: AnchoredEntry;
  /** Cuando tocaba: la hora anclada o el final de la posposicion. */
  at: number;
};

/**
 * Una hora anclada no se avisa si ya paso hace mas de esto: abrir la pestaña
 * a media tarde no deberia soltar de golpe todos los avisos de la mañana.
 */
export const REMINDER_WINDOW_MS = 15 * 60 * 1000;

/**
 * Los avisos que tocan ahora (ADR 055). Puro: el reloj, lo ya avisado y lo
 * pospuesto llegan de fuera. Una entrada pospuesta no avisa por su hora
 * anclada sino por el final de la posposicion, con una clave propia para que
 * vuelva a sonar una vez.
 */
export function dueReminders(
  entries: AnchoredEntry[],
  {
    now,
    fired,
    snoozedUntil,
    windowMs = REMINDER_WINDOW_MS,
  }: {
    now: number;
    fired: ReadonlySet<string>;
    snoozedUntil: Readonly<Record<string, number>>;
    windowMs?: number;
  },
): DueReminder[] {
  const due: DueReminder[] = [];

  for (const entry of entries) {
    if (entry.isDone || !entry.startsAt) continue;

    const anchored = new Date(entry.startsAt).getTime();
    const snooze = snoozedUntil[entry.id];
    const at = snooze !== undefined && snooze > anchored ? snooze : anchored;
    if (at > now || now - at > windowMs) continue;

    const key =
      at === anchored
        ? `anchor:${entry.id}:${entry.startsAt}`
        : `anchor:${entry.id}:${entry.startsAt}:snooze:${at}`;
    if (fired.has(key)) continue;

    due.push({ key, entry, at });
  }

  return due.sort((a, b) => a.at - b.at);
}
