import { windowId } from "@riuna/libs";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { getApiUrl } from "@/fetchers/get-api-url";
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
const MY_WORK_DEBOUNCE_MS = 300;

/**
 * Maintains a user-scoped WebSocket connection for receiving user-targeted
 * real-time events (e.g. NOTIFICATION_CREATED). Invalidates TanStack Query
 * caches as needed, so no polling is required.
 */
export function useUserWebSocket() {
  const queryClient = useQueryClient();
  const { data: session } = authClient.useSession();
  const wsRef = useRef<WebSocket | null>(null);
  const retriesRef = useRef(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const myWorkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!session?.user?.id) return;

    retriesRef.current = 0;

    /**
     * El canal de usuario avisa cuando cambia **si una tarea es tuya**, que es
     * lo que decide si aparece o desaparece del panel personal.
     *
     * Invalida las dos claves. `["my-work"]` es la lectura de la API, que sigue
     * publicada; `["dashboard-data"]` es la pantalla, que desde la Fase 7 es
     * quien la pinta. Sin esto el panel tardaria hasta un minuto en enterarse
     * de que alguien le ha asignado algo, y "Mi trabajo" si lo enseñaba al
     * momento: fundir las dos pantallas no puede costar esa propiedad.
     *
     * El resto del contenido —prioridad, fecha, titulo— sigue llegando por el
     * intervalo: son eventos que disparan en cada arrastre y poner una
     * resolucion de destinatarios en el camino de mutacion mas caliente del
     * producto es exactamente lo que la ADR 024 descarto.
     */
    function scheduleMyWorkInvalidate() {
      if (myWorkTimerRef.current) {
        clearTimeout(myWorkTimerRef.current);
      }
      myWorkTimerRef.current = setTimeout(() => {
        myWorkTimerRef.current = null;
        queryClient.invalidateQueries({ queryKey: ["my-work"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard-data"] });
      }, MY_WORK_DEBOUNCE_MS);
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
          const message = JSON.parse(event.data as string) as {
            type?: string;
            workspaceId?: string;
          };
          if (message.type === "NOTIFICATION_CREATED") {
            queryClient.invalidateQueries({ queryKey: ["notifications"] });
          }
          if (message.type === "MY_WORK_INVALIDATED") {
            scheduleMyWorkInvalidate();
          }
          // El plan personal es de una sola persona y no comparte nada con
          // "my-work": otra sesion propia -otra pestana, el movil- movio una
          // tarjeta, y esta hay que refrescarla tambien. El Cronograma lee
          // `personal_plan_entry` ademas de lo suyo (ADR 041), asi que un
          // cambio de plan tambien lo invalida.
          if (message.type === "PLAN_INVALIDATED") {
            queryClient.invalidateQueries({ queryKey: ["planner"] });
            queryClient.invalidateQueries({ queryKey: ["schedule"] });
            queryClient.invalidateQueries({ queryKey: ["today"] });
            queryClient.invalidateQueries({ queryKey: ["my-work", "counts"] });
          }
          if (message.type === "SCHEDULE_INVALIDATED") {
            queryClient.invalidateQueries({ queryKey: ["schedule"] });
          }
          // Un solo cronometro por persona (ADR 044): arrancar, parar -a mano
          // o porque la tarea entro en una columna final- y editar o borrar
          // una entrada del parte de horas llegan todos por aqui, para que el
          // pie de la barra y la pastilla movil se enteren aunque el cambio
          // venga de otra pestana o de un evento del servidor.
          if (message.type === "TIMER_CHANGED") {
            queryClient.invalidateQueries({ queryKey: ["time-entry"] });
            queryClient.invalidateQueries({ queryKey: ["schedule"] });
            queryClient.invalidateQueries({ queryKey: ["time-sheet"] });
            queryClient.invalidateQueries({ queryKey: ["today"] });
            queryClient.invalidateQueries({ queryKey: ["my-work", "counts"] });
          }
          // Una vista de espacio sin proyecto no tiene socket de proyecto que la
          // escuche: llega por aqui. El prefijo cubre las tres claves de
          // `["workspace-views", workspaceId, type ?? "all"]`.
          if (message.type === "VIEW_UPDATED" && message.workspaceId) {
            queryClient.invalidateQueries({
              queryKey: ["workspace-views", message.workspaceId],
            });
          }
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
      if (myWorkTimerRef.current) {
        clearTimeout(myWorkTimerRef.current);
        myWorkTimerRef.current = null;
      }
      wsRef.current?.close();
    };
  }, [session?.user?.id, queryClient]);
}
