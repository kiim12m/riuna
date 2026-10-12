import { isIP } from "node:net";
import { log } from "./log";

/**
 * `RIUNA_DISABLE_OUTBOUND=true`: la API no sale de la máquina (ADR 072).
 *
 * Es para el simulacro de restauración. Una copia real trae en claro el token
 * de Gitea y los webhooks de Discord, Slack y Telegram de las integraciones de
 * proyecto, y los suscriptores de los plugins siguen escuchando: sin esto, una
 * tarea movida por el humo podía avisar a un chat de verdad (revisión de la
 * Fase 9).
 *
 * Basta con `fetch` porque toda salida HTTP de la API pasa por él: plugins,
 * Gitea, GitHub (Octokit usa el `fetch` global), ntfy, Gotify, el webhook de
 * avisos y Turnstile. El correo no; el `.env` del simulacro no lleva SMTP.
 */
export function outboundDisabled() {
  return process.env.RIUNA_DISABLE_OUTBOUND === "true";
}

function isLoopback(hostname: string) {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  if (host === "::1") return true;
  return isIP(host) === 4 && host.startsWith("127.");
}

function requestUrl(input: Parameters<typeof fetch>[0]) {
  if (input instanceof Request) return new URL(input.url);
  return new URL(String(input));
}

/** `fetch`, pero solo hacia esta misma máquina. */
export function guardFetch(realFetch: typeof fetch): typeof fetch {
  return async (input, init) => {
    const url = requestUrl(input);
    if (!isLoopback(url.hostname)) {
      log.warn("Blocked an outbound request", { origin: url.origin });
      throw new Error(
        `Outbound requests are disabled (RIUNA_DISABLE_OUTBOUND): ${url.origin}`,
      );
    }
    return realFetch(input, init);
  };
}

/** Se llama al arrancar, antes que los plugins y el planificador. */
export function installOutboundGuard() {
  if (!outboundDisabled()) return;
  globalThis.fetch = guardFetch(globalThis.fetch);
  log.info("Outbound requests are disabled (RIUNA_DISABLE_OUTBOUND)");
}
