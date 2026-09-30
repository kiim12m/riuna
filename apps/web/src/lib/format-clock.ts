/**
 * `00:42:17`: el reloj del cronometro, no la duracion en prosa que ya dan
 * `formatDuration` de `lib/duration.ts` y `lib/format-duration.ts`. Cifras
 * tabulares con cero relleno, como `time` en la maqueta de la barra lateral.
 */
export function formatElapsedClock(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  return [hours, minutes, secs]
    .map((part) => String(part).padStart(2, "0"))
    .join(":");
}
