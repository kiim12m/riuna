import { AsyncLocalStorage } from "node:async_hooks";

/**
 * El registro de la API (ADR 073): una línea JSON por suceso en producción y
 * una línea legible en desarrollo. Sin dependencia: a este volumen, pino no
 * aporta nada que no quepa aquí.
 *
 * La firma es la de `console` a propósito, para que pasar de uno a otro sea
 * mecánico:
 *
 *   log.error("No se pudo enviar el aviso", error, { taskId });
 *
 * - el primer argumento, si es texto, es el mensaje (`msg`);
 * - un objeto plano se funde como campos;
 * - un `Error` va a `error`, con su pila y su causa;
 * - lo demás va a `details`.
 *
 * Dentro de una petición, cada línea lleva su `requestId` sin pasarlo a mano
 * (`withRequestContext`, desde el middleware de petición).
 *
 * Nunca escribe secretos: cualquier campo cuyo nombre suene a contraseña,
 * token, cookie o clave sale como `[redacted]`, a cualquier profundidad.
 */

type Level = "debug" | "info" | "warn" | "error";

const LEVEL_RANK: Record<Level, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

// `^pass$` y no `pass` a secas: «passed» o «bypass» no son secretos.
const SECRET_KEY =
  /password|passwd|^pass$|secret|token|authorization|cookie|api[-_]?key|credential/i;
const MAX_DEPTH = 6;

const requestContext = new AsyncLocalStorage<{ requestId: string }>();

export function withRequestContext<T>(requestId: string, run: () => T): T {
  return requestContext.run({ requestId }, run);
}

function minimumLevel(): Level {
  const configured = process.env.LOG_LEVEL?.trim().toLowerCase();
  return configured && configured in LEVEL_RANK
    ? (configured as Level)
    : "info";
}

function format(): "json" | "pretty" {
  const configured = process.env.LOG_FORMAT?.trim().toLowerCase();
  if (configured === "json" || configured === "pretty") return configured;
  return process.env.NODE_ENV === "production" ? "json" : "pretty";
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function sanitize(
  value: unknown,
  depth: number,
  seen: WeakSet<object>,
): unknown {
  if (value instanceof Error) {
    if (seen.has(value)) return "[circular]";
    seen.add(value);
    const error: Record<string, unknown> = {
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
    const code = (value as { code?: unknown }).code;
    if (code !== undefined) error.code = code;
    const status = (value as { status?: unknown }).status;
    if (typeof status === "number") error.status = status;
    if (value.cause !== undefined && depth < MAX_DEPTH) {
      error.cause = sanitize(value.cause, depth + 1, seen);
    }
    return error;
  }
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "function" || typeof value === "symbol") {
    return undefined;
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? "Invalid Date" : value.toISOString();
  }
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value)) return "[circular]";
  if (depth >= MAX_DEPTH) return "[…]";
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => sanitize(item, depth + 1, seen));
  }

  const entries = isPlainObject(value)
    ? Object.entries(value)
    : // Una instancia cualquiera (un Map, una respuesta) se resume en vez de
      // volcarse: su forma interna no es lo que se quiere leer en un log.
      [["type", value.constructor?.name ?? "Object"]];
  const copy: Record<string, unknown> = {};
  for (const [key, item] of entries) {
    copy[key as string] = SECRET_KEY.test(key as string)
      ? "[redacted]"
      : sanitize(item, depth + 1, seen);
  }
  return copy;
}

/** La línea que se escribe, como objeto. Exportada para las pruebas. */
export function buildEntry(level: Level, args: unknown[]) {
  let msg = "";
  const fields: Record<string, unknown> = {};
  const details: unknown[] = [];

  args.forEach((arg, index) => {
    if (index === 0 && typeof arg === "string") {
      msg = arg;
    } else if (arg instanceof Error && !("error" in fields)) {
      fields.error = arg;
    } else if (isPlainObject(arg)) {
      Object.assign(fields, arg);
    } else {
      details.push(arg);
    }
  });

  const seen = new WeakSet<object>();
  const entry: Record<string, unknown> = {
    ...(sanitize(fields, 0, seen) as Record<string, unknown>),
  };
  if (details.length > 0) entry.details = sanitize(details, 0, seen);

  const requestId = requestContext.getStore()?.requestId;
  if (requestId && entry.requestId === undefined) entry.requestId = requestId;

  // La cabecera se escribe dos veces: delante, para que abra la línea, y
  // detrás, para que ningún campo llamado `level` o `msg` la pise. Reasignar
  // una clave no la cambia de sitio.
  const header = { time: new Date().toISOString(), level, msg };
  return Object.assign({ ...header }, entry, header) as Record<
    string,
    unknown
  > & { time: string; level: Level; msg: string };
}

function prettyValue(value: unknown) {
  if (typeof value === "string") {
    return /\s/.test(value) ? JSON.stringify(value) : value;
  }
  return JSON.stringify(value);
}

function pretty(entry: ReturnType<typeof buildEntry>) {
  const { time, level, msg, error, ...rest } = entry;
  const clock = time.slice(11, 23);
  const pairs = Object.entries(rest)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}=${prettyValue(value)}`)
    .join(" ");
  let line = `${clock} ${level.toUpperCase().padEnd(5)} ${msg}${pairs ? ` ${pairs}` : ""}`;
  const stack = (error as { stack?: unknown } | undefined)?.stack;
  if (typeof stack === "string") {
    line += `\n${stack}`;
  } else if (error !== undefined) {
    line += ` error=${prettyValue(error)}`;
  }
  return line;
}

function write(level: Level, args: unknown[]) {
  if (LEVEL_RANK[level] < LEVEL_RANK[minimumLevel()]) return;

  const entry = buildEntry(level, args);
  const line = format() === "json" ? JSON.stringify(entry) : pretty(entry);
  const stream =
    level === "error" || level === "warn" ? process.stderr : process.stdout;
  stream.write(`${line}\n`);
}

export const log = {
  debug: (...args: unknown[]) => write("debug", args),
  info: (...args: unknown[]) => write("info", args),
  warn: (...args: unknown[]) => write("warn", args),
  error: (...args: unknown[]) => write("error", args),
};

export default log;
