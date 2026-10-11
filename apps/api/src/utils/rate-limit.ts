import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { clientIp } from "./client-ip";
import { log } from "./log";

/**
 * Límites de tasa de la API (ADR 074): ventanas fijas en memoria.
 *
 * En memoria a propósito: una sola instancia es el caso de primera clase, y un
 * Redis obligatorio para esto contradiría `AGENTS.md`. Con varias instancias,
 * cada una cuenta lo suyo: el límite efectivo se multiplica por el número de
 * instancias, que es aceptable para frenar abusos, no para facturar.
 *
 * Better Auth limita aparte, y con más rigor, entrar, registrarse y recuperar
 * la contraseña (`auth.ts`).
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
let lastSweep = 0;

export function rateLimitEnabled() {
  return process.env.RATE_LIMIT_ENABLED !== "false";
}

/** Peticiones por minuto de cada persona o clave, en toda la API. */
export function userLimitPerMinute() {
  const configured = Number(process.env.RATE_LIMIT_USER_PER_MINUTE);
  return Number.isInteger(configured) && configured > 0 ? configured : 600;
}

function sweep(now: number) {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

/**
 * Cuenta una petición en `key`. Devuelve `null` si cabe, o los segundos que
 * faltan para que se abra la ventana si se ha pasado.
 */
export function hit(
  key: string,
  max: number,
  windowMs: number,
  now = Date.now(),
): number | null {
  sweep(now);
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return null;
  }
  bucket.count += 1;
  if (bucket.count <= max) return null;
  return Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
}

/** Solo para las pruebas: cada caso empieza sin cupos gastados. */
export function resetRateLimits() {
  buckets.clear();
  lastSweep = 0;
}

function tooManyRequests(c: Context, limit: string, retryAfter: number): never {
  log.warn("Rate limited", {
    limit,
    method: c.req.method,
    retryAfter,
  });
  throw new HTTPException(429, {
    res: new Response(JSON.stringify({ message: "Too many requests" }), {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(retryAfter),
      },
    }),
  });
}

/**
 * Para las rutas sin sesión: cuenta por IP. `name` separa los cupos: el feed
 * de un calendario no gasta el de los webhooks.
 */
export function limitByIp(name: string, max: number, windowMs = 60_000) {
  return createMiddleware(async (c, next) => {
    if (rateLimitEnabled()) {
      const wait = hit(`${name}:${clientIp(c) ?? "unknown"}`, max, windowMs);
      if (wait !== null) tooManyRequests(c, name, wait);
    }
    await next();
  });
}

/**
 * Para lo autenticado: cuenta por persona, sea por sesión o por clave de API.
 * Detrás del reenvío de puertos de Docker Desktop todas las IP llegan iguales;
 * la persona, no.
 */
export function enforceUserLimit(c: Context, userId: string) {
  if (!rateLimitEnabled() || !userId) return;
  const wait = hit(`user:${userId}`, userLimitPerMinute(), 60_000);
  if (wait !== null) tooManyRequests(c, "user", wait);
}
