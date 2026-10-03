/**
 * El siguiente dia laborable despues de `fromKey`, segun la mascara de la
 * jornada personal (bit 0 domingo … bit 6 sabado, como `Date#getDay()`,
 * ADR 045). Sin ningun dia marcado, el dia siguiente: mejor eso que no
 * devolver nada.
 */
export function nextWorkDayKey(fromKey: string, workDays: number): string {
  const [year, month, day] = fromKey.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  for (let step = 1; step <= 7; step++) {
    date.setDate(date.getDate() + 1);
    if ((workDays >> date.getDay()) & 1) return keyOf(date);
  }
  const fallback = new Date(year, month - 1, day + 1);
  return keyOf(fallback);
}

function keyOf(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}
