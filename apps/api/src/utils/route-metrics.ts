/**
 * Tiempos por ruta para el estado de la instancia (ADR 075), en memoria.
 *
 * Las últimas `SAMPLES` duraciones de cada ruta y sus recuentos desde que
 * arrancó el proceso. Se pierden al reiniciar, y la página lo dice: para lo que
 * sirve —ver qué pantalla va lenta hoy— no hace falta más, y una tabla o un
 * Prometheus serían una dependencia que operar.
 */

const SAMPLES = 200;
// Los patrones de ruta son finitos, pero un tope no cuesta nada.
const MAX_SERIES = 500;

type Series = {
  method: string;
  route: string;
  count: number;
  errors: number;
  durations: number[];
  next: number;
};

const series = new Map<string, Series>();

export const processStartedAt = new Date();

export function recordRequest(
  method: string,
  route: string | null,
  status: number,
  durationMs: number,
) {
  const name = route ?? "(sin ruta)";
  const key = `${method} ${name}`;
  let entry = series.get(key);
  if (!entry) {
    if (series.size >= MAX_SERIES) return;
    entry = {
      method,
      route: name,
      count: 0,
      errors: 0,
      durations: [],
      next: 0,
    };
    series.set(key, entry);
  }
  entry.count += 1;
  if (status >= 500) entry.errors += 1;
  if (entry.durations.length < SAMPLES) {
    entry.durations.push(durationMs);
  } else {
    entry.durations[entry.next] = durationMs;
    entry.next = (entry.next + 1) % SAMPLES;
  }
}

function percentile(sorted: number[], p: number) {
  if (sorted.length === 0) return 0;
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
  );
  return sorted[index] ?? 0;
}

/**
 * Las rutas más lentas por p95, entre las que tienen al menos `minCount`
 * peticiones: con dos peticiones, el p95 es solo la más lenta.
 */
export function slowestRoutes(limit = 10, minCount = 5) {
  return [...series.values()]
    .filter((entry) => entry.count >= minCount)
    .map((entry) => {
      const sorted = [...entry.durations].sort((a, b) => a - b);
      return {
        method: entry.method,
        route: entry.route,
        count: entry.count,
        errors: entry.errors,
        p50: percentile(sorted, 50),
        p95: percentile(sorted, 95),
      };
    })
    .sort((a, b) => b.p95 - a.p95)
    .slice(0, limit);
}

/** Los 5xx desde el arranque, de todas las rutas. */
export function serverErrorCount() {
  let total = 0;
  for (const entry of series.values()) total += entry.errors;
  return total;
}

/** Solo para las pruebas. */
export function resetRouteMetrics() {
  series.clear();
}
