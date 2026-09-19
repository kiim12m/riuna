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
