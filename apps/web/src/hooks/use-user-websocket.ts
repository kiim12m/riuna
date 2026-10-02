import { windowId } from "@riuna/libs";
import { type QueryKey, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { getApiUrl } from "@/fetchers/get-api-url";
import {
  DEBOUNCED_USER_MESSAGES,
  type UserWsMessage,
  userMessageInvalidations,
} from "@/hooks/user-ws-invalidations";
import { authClient } from "@/lib/auth-client";

export function getUserWsUrl() {
  const base = getApiUrl("ws");
  const wsBase = base.replace(/^http/, "ws");
  return `${wsBase}/user?windowId=${encodeURIComponent(windowId)}`;
}

const MAX_RETRIES = 5;
const BASE_DELAY = 1000;
const WS_PING_INTERVAL_MS = 30_000;

/**
 * `PATCH /task/bulk` publica un evento **por tarea**, asi que asignar veinte de
 * golpe llegaria aqui como veinte mensajes y veinte refetchs de la misma
 * consulta. Esta ventana los junta en uno, igual que la cola de 100 ms que la
 * difusion por proyecto ya usa en el servidor.
 */
const DEBOUNCE_MS = 300;

/**
 * Maintains a user-scoped WebSocket connection for receiving user-targeted
 * real-time events (e.g. NOTIFICATION_CREATED). Invalidates TanStack Query
 * caches as needed, so no polling is required. Which keys each message
 * invalidates lives in `user-ws-invalidations.ts`.
 *
 * Se monta una sola vez en `WorkspaceRuntime` (ADR 048), no en la barra
 * lateral: en movil la barra es un panel que se desmonta al cerrarse, y con
 * ella se iba la conexion.
 */
export function useUserWebSocket() {
  const queryClient = useQueryClient();
  const { data: session } = authClient.useSession();
  const wsRef = useRef<WebSocket | null>(null);
  const retriesRef = useRef(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!session?.user?.id) return;

    retriesRef.current = 0;

    /**
     * Junta en una sola pasada los mensajes que llegan en rafaga
     * (`DEBOUNCED_USER_MESSAGES`): asignar veinte tareas de golpe son veinte
     * avisos y deben ser un solo refetch por clave.
     */
    function scheduleDebounced(type: string) {
      pendingRef.current.add(type);
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      debounceTimerRef.current = setTimeout(() => {
        debounceTimerRef.current = null;
        const types = [...pendingRef.current];
        pendingRef.current.clear();
        for (const pending of types) {
          invalidate(userMessageInvalidations({ type: pending }));
        }
      }, DEBOUNCE_MS);
    }

    function invalidate(keys: QueryKey[]) {
      for (const queryKey of keys) {
        queryClient.invalidateQueries({ queryKey });
      }
    }

    function clearPing() {
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = null;
      }
    }

    function connect() {
      const url = getUserWsUrl();
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        retriesRef.current = 0;
        clearPing();
        pingIntervalRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "ping" }));
          }
        }, WS_PING_INTERVAL_MS);
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data as string) as UserWsMessage;
          if (!message.type) return;
          if (DEBOUNCED_USER_MESSAGES.has(message.type)) {
            scheduleDebounced(message.type);
            return;
          }
          invalidate(userMessageInvalidations(message));
        } catch {
          // Ignore malformed messages
        }
      };

      ws.onclose = () => {
        clearPing();
        wsRef.current = null;

        if (retriesRef.current < MAX_RETRIES) {
          const delay = BASE_DELAY * 2 ** retriesRef.current;
          retriesRef.current += 1;
          timeoutRef.current = setTimeout(connect, delay);
        }
      };
    }

    connect();

    return () => {
      retriesRef.current = MAX_RETRIES; // prevent reconnect after unmount
      clearPing();
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      pendingRef.current.clear();
      wsRef.current?.close();
    };
  }, [session?.user?.id, queryClient]);
}
