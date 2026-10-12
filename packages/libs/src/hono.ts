/// <reference types="vite/types/importMeta.d.ts" />

import type { AppType } from "@riuna/api";
import { hc } from "hono/client";
import { resolveApiBaseUrl } from "./api-url";

const apiUrl = resolveApiBaseUrl(import.meta.env.VITE_API_URL);

// Generate once per tab load
export const windowId = Math.random().toString(36).substring(2, 11);

/**
 * Las cabeceras de cada peticion al API.
 *
 * `Content-Type: application/json` solo va cuando el cuerpo no es un
 * `FormData`. Con un formulario el navegador tiene que poner el suyo,
 * `multipart/form-data; boundary=…`: forzar JSON dejaba al servidor sin ver un
 * solo campo (`Expected "file" but received undefined`), y el asistente de
 * importacion de la Fase 5 no funciono nunca en un navegador, aunque su API
 * tuviera 19 casos de integracion en verde.
 */
export function apiHeaders(init?: RequestInit): HeadersInit {
  const isForm =
    typeof FormData !== "undefined" && init?.body instanceof FormData;

  return {
    ...init?.headers,
    ...(isForm ? {} : { "Content-Type": "application/json" }),
    "X-Riuna-Window-Id": windowId,
  };
}

type RateLimitListener = (retryAfterSeconds: number) => void;

const rateLimitListeners = new Set<RateLimitListener>();

/**
 * Avisa cuando la API corta por exceso de peticiones (ADR 074). `libs` no sabe
 * de traducciones ni de avisos en pantalla: la web se suscribe y lo explica.
 * Devuelve la funcion que anula la suscripcion.
 */
export function onRateLimited(listener: RateLimitListener) {
  rateLimitListeners.add(listener);
  return () => {
    rateLimitListeners.delete(listener);
  };
}

function notifyRateLimited(response: Response) {
  if (response.status !== 429) return;
  const retryAfter = Number(response.headers.get("Retry-After"));
  const seconds =
    Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 60;
  for (const listener of rateLimitListeners) listener(seconds);
}

// Sin anotar, la declaracion emitida tendria que nombrar tipos internos de la
// API que `libs` no puede alcanzar (TS2883); `AppType` si es publico.
export const client: ReturnType<typeof hc<AppType>> = hc<AppType>(apiUrl, {
  fetch: (input: RequestInfo | URL, init?: RequestInit) => {
    return fetch(input, {
      ...init,
      headers: apiHeaders(init),
      credentials: "include",
    })
      .then((response) => {
        notifyRateLimited(response);
        return response;
      })
      .catch((error) => {
        if (error instanceof TypeError && error.message.includes("fetch")) {
          throw new Error(
            `Failed to connect to API server at ${apiUrl}. This might be due to CORS configuration issues or the server not running. Please check your environment variables and server status.`,
          );
        }
        throw error;
      });
  },
});
