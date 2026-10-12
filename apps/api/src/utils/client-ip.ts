import { BlockList, isIP } from "node:net";
import { getConnInfo } from "@hono/node-server/conninfo";
import type { Context } from "hono";
import { log } from "./log";

/**
 * La IP de quien llama, para los límites de tasa (ADR 074). Se calcula aquí y
 * solo aquí: Better Auth la recibe ya resuelta en `CLIENT_IP_HEADER`.
 *
 * `X-Forwarded-For` solo cuenta si la conexión llega de un proxy de confianza
 * (`TRUSTED_PROXIES`, por defecto las redes privadas y localhost: el nginx de la
 * imagen única, la pasarela de Docker por la que entra `tailscale serve`). Se
 * recorre de derecha a izquierda saltando proxies de confianza, y la primera
 * que no lo es, es el cliente. La entrada de más a la izquierda la escribe quien
 * llama y se puede inventar; la que añade el proxy, no.
 *
 * Antes Better Auth leía `cf-connecting-ip` y `X-Forwarded-For` sin mirar de
 * dónde venía la conexión: con los límites encendidos, inventarse la cabecera
 * daba un cupo nuevo en cada petición.
 */
export const CLIENT_IP_HEADER = "x-riuna-client-ip";

const DEFAULT_TRUSTED_PROXIES = [
  "127.0.0.0/8",
  "::1/128",
  "10.0.0.0/8",
  "172.16.0.0/12",
  "192.168.0.0/16",
];

/**
 * Una entrada de `TRUSTED_PROXIES` en la lista. Devuelve `false` si no vale.
 *
 * El prefijo se comprueba antes de llegar a `BlockList`: `/33` hacía lanzar a
 * `addSubnet` en cada petición, y `10.0.0.0/` acababa en `Number("") === 0`, o
 * sea, en confiar en todo internet (revisión de la Fase 9). Un `/0` escrito a
 * propósito sí vale.
 */
function addTrustedEntry(list: BlockList, entry: string) {
  const [network = "", prefix, ...rest] = entry.split("/");
  const family = isIP(network);
  if (family === 0 || rest.length > 0) return false;
  const type = family === 6 ? "ipv6" : "ipv4";
  if (prefix === undefined) {
    list.addAddress(network, type);
    return true;
  }
  const bits = Number(prefix);
  if (!/^\d{1,3}$/.test(prefix) || bits > (family === 6 ? 128 : 32)) {
    return false;
  }
  list.addSubnet(network, bits, type);
  return true;
}

function buildTrustedProxyList(raw: string) {
  const entries = raw
    ? raw
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean)
    : DEFAULT_TRUSTED_PROXIES;
  const list = new BlockList();
  for (const entry of entries) {
    if (!addTrustedEntry(list, entry)) {
      log.warn("Ignoring an invalid TRUSTED_PROXIES entry", { entry });
    }
  }
  return list;
}

// Se construye una vez por valor de la variable, no en cada petición. Por
// valor, y no una sola vez, para que las pruebas puedan cambiarla.
let cached: { raw: string; list: BlockList } | null = null;

function trustedProxyList() {
  const raw = process.env.TRUSTED_PROXIES?.trim() ?? "";
  if (cached?.raw !== raw) {
    cached = { raw, list: buildTrustedProxyList(raw) };
  }
  return cached.list;
}

// `::ffff:172.17.0.1` es una IPv4 vista por un socket de doble pila.
function normalize(address: string) {
  const trimmed = address.trim();
  const mapped = trimmed.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  return mapped?.[1] ?? trimmed;
}

function isTrusted(list: BlockList, address: string) {
  const family = isIP(address);
  if (family === 0) return false;
  return list.check(address, family === 6 ? "ipv6" : "ipv4");
}

function socketAddress(c: Context) {
  try {
    const address = getConnInfo(c).remote.address;
    return address ? normalize(address) : null;
  } catch {
    // Sin socket: las pruebas que llaman a `app.request()`.
    return null;
  }
}

/** Resuelve la IP de la cadena «X-Forwarded-For, …, socket». Exportada para las pruebas. */
export function resolveClientIp(
  forwardedFor: string | undefined,
  peer: string | null,
  trusted = trustedProxyList(),
): string | null {
  if (!peer) return null;
  if (!isTrusted(trusted, peer)) return peer;

  const hops = (forwardedFor ?? "").split(",").map(normalize).filter(Boolean);
  for (let index = hops.length - 1; index >= 0; index -= 1) {
    const hop = hops[index] ?? "";
    if (isIP(hop) === 0) return null;
    if (!isTrusted(trusted, hop)) return hop;
  }
  // Todo de confianza: se llama desde la propia máquina, sin proxy delante.
  return peer;
}

export function clientIp(c: Context): string | null {
  return resolveClientIp(c.req.header("x-forwarded-for"), socketAddress(c));
}

/**
 * La petición tal cual, con la IP resuelta para Better Auth. La cabecera que
 * traiga quien llama se borra: si no, se la podría poner él.
 */
export function requestWithClientIp(c: Context): Request {
  const headers = new Headers(c.req.raw.headers);
  headers.delete(CLIENT_IP_HEADER);
  const ip = clientIp(c);
  if (ip) headers.set(CLIENT_IP_HEADER, ip);
  return new Request(c.req.raw, { headers });
}
