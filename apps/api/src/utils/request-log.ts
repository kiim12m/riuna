import { randomUUID } from "node:crypto";
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import { matchedRoutes } from "hono/route";
import { log, withRequestContext } from "./log";

// Un id que llega de fuera se respeta solo si es razonable: va a cada línea de
// log y a una cabecera de respuesta.
const INCOMING_ID = /^[\w.:-]{1,128}$/;

// El healthcheck de Docker pregunta cada 30 s: registrarlo solo haría ruido.
const QUIET_PATHS = new Set(["/api/health"]);

/**
 * El patrón de la ruta pedida.
 *
 * Tras `next()`, `c.req.routeIndex` es el último manejador que llegó a correr.
 * Si es una ruta concreta, esa es. Si es un middleware (`use`, método `ALL`) es
 * que cortó antes —el `/api/*` de la autenticación con un 401—, y lo útil es la
 * ruta concreta a la que iba la petición. La última ruta que *casa* no sirve: un
 * middleware registrado después no corre si el manejador ya respondió.
 */
export function respondingRoute(c: Context) {
  const routes = matchedRoutes(c);
  if (routes.length === 0) return null;
  const responding = routes[c.req.routeIndex];
  if (responding && responding.method !== "ALL") return responding.path;
  for (let index = routes.length - 1; index >= 0; index -= 1) {
    const route = routes[index];
    if (route && route.method !== "ALL") return route.path;
  }
  return responding?.path ?? null;
}

/**
 * Una línea por petición (ADR 073): método, patrón de ruta, estado, duración y
 * usuario. Todo lo que se registre mientras dura la petición lleva su
 * `requestId`, que también sale en la cabecera `X-Request-Id`.
 *
 * **El patrón de ruta, nunca la ruta cruda**: el token del calendario va en la
 * ruta (`/calendar/<token>.ics`), y en la de restablecer la contraseña también.
 * Por lo mismo no se registran ni la query ni los cuerpos.
 */
export const requestLog = createMiddleware<{
  Variables: { requestId: string; userId: string };
}>(async (c, next) => {
  const incoming = c.req.header("x-request-id");
  const requestId =
    incoming && INCOMING_ID.test(incoming) ? incoming : randomUUID();
  c.set("requestId", requestId);

  const started = performance.now();
  await withRequestContext(requestId, next);

  try {
    c.res.headers.set("X-Request-Id", requestId);
  } catch {
    // Algunas respuestas (la subida a WebSocket) traen cabeceras inmutables.
  }

  if (QUIET_PATHS.has(c.req.path)) return;

  const { status } = c.res;
  const fields = {
    requestId,
    method: c.req.method,
    route: respondingRoute(c),
    status,
    durationMs: Math.round(performance.now() - started),
    userId: c.get("userId") || undefined,
  };

  if (status >= 500) {
    log.error("request", fields);
  } else {
    log.info("request", fields);
  }
});
