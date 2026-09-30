// El tiempo estimado y el registrado se guardan en segundos. La interfaz
// trabaja en horas, que es como la gente estima, y redondea a un decimal: la
// precision de un cronometro en una estimacion es ruido.

export function secondsToHours(seconds: number): number {
  return Math.round((seconds / 3600) * 10) / 10;
}

export function hoursToSeconds(hours: number): number {
  return Math.round(hours * 3600);
}

/** `2,5 h`, o `45 min` cuando no llega a la hora. */
export function formatDuration(seconds: number, locale: string): string {
  if (seconds <= 0) return "0 h";

  if (seconds < 3600) {
    return `${Math.round(seconds / 60)} min`;
  }

  return `${secondsToHours(seconds).toLocaleString(locale)} h`;
}

/**
 * El mismo texto que ya escribe quien estima, en cualquiera de sus formas:
 * `1h 30m`, `1h30`, `90m`, `1:30` (horas:minutos) o `1,5` (horas decimales,
 * la unica que aceptaba `task-tree.tsx` antes de esto). Vacio es "sin
 * estimar" (`null`); lo que no encaja en ninguna forma es `undefined`, para
 * que quien llama sepa que hay que rechazarlo y no confundirlo con "sin
 * estimar".
 */
export function parseDurationInput(input: string): number | null | undefined {
  const trimmed = input.trim();
  if (trimmed === "") return null;

  const hoursMinutes = /^(\d+):([0-5]\d)$/.exec(trimmed);
  if (hoursMinutes) {
    const [, hours, minutes] = hoursMinutes;
    return hoursToSeconds(Number(hours)) + Number(minutes) * 60;
  }

  // "1h", "1h30" (los 30 son minutos sin unidad propia, solo validos pegados
  // a una hora), "1h30m", "1h 30m".
  const hoursAndMaybeMinutes =
    /^(\d+(?:[.,]\d+)?)\s*h\s*(\d+)?\s*m?(?:in)?$/i.exec(trimmed);
  if (hoursAndMaybeMinutes) {
    const [, hoursText, minutesText] = hoursAndMaybeMinutes;
    const hours = Number(hoursText.replace(",", "."));
    const minutes = minutesText ? Number(minutesText) : 0;
    return hoursToSeconds(hours) + minutes * 60;
  }

  // "90m", "45min": minutos sueltos, la unidad es obligatoria aqui -sin ella
  // seria indistinguible de las horas decimales de mas abajo-.
  const minutesOnly = /^(\d+)\s*m(?:in)?$/i.exec(trimmed);
  if (minutesOnly) {
    return Number(minutesOnly[1]) * 60;
  }

  const bareHours = Number(trimmed.replace(",", "."));
  if (!Number.isNaN(bareHours) && bareHours >= 0) {
    return hoursToSeconds(bareHours);
  }

  return undefined;
}
