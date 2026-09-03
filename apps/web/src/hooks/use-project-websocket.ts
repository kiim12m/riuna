import { windowId } from "@riuna/libs";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { getApiUrl } from "@/fetchers/get-api-url";
import { authClient } from "@/lib/auth-client";
import useRealtimeHighlightStore from "@/store/realtime-highlight";

export function getWsUrl(projectId: string) {
  const base = getApiUrl("ws");
  const wsBase = base.replace(/^http/, "ws");
  return `${wsBase}/${encodeURIComponent(projectId)}?windowId=${encodeURIComponent(windowId)}`;
}

const MAX_RETRIES = 5;
const BASE_DELAY = 1000; // 1 second

// Cloudflare closes idle WebSocket connections after 100 seconds of no traffic.
// We send a lightweight ping every 30 seconds to keep the connection alive.
const WS_PING_INTERVAL_MS = 30_000;

export function useProjectWebSocket(projectId: string) {
  const queryClient = useQueryClient();
  const { data: session } = authClient.useSession();
  const wsRef = useRef<WebSocket | null>(null);
  const retriesRef = useRef(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!projectId || !session?.user?.id) return;

    retriesRef.current = 0;

    function clearPing() {
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = null;
      }
    }

    function connect() {
      const url = getWsUrl(projectId);
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        retriesRef.current = 0; // Reset retries on successful connection
        // Start keepalive pings to prevent Cloudflare idle timeout (100s)
        clearPing();
        pingIntervalRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "ping" }));
          }
        }, WS_PING_INTERVAL_MS);
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          if (
            message.type === "TASK_UPDATED" ||
            message.type === "TASK_CREATED" ||
            message.type === "TASK_DELETED" ||
            message.type === "TASK_LABEL_UPDATED" ||
            message.type === "TASK_MOVED" ||
            message.type === "TASK_RELATION_UPDATED" ||
            message.type === "EPIC_UPDATED" ||
            message.type === "VIEW_UPDATED" ||
            message.type === "FIELD_DEFINITION_UPDATED" ||
            message.type === "COMMENT_UPDATED"
          ) {
            queryClient.invalidateQueries({
              queryKey: ["tasks", message.projectId],
            });

            // Resalte en tiempo real: el servidor no reenvia el evento a la
            // ventana que lo origino, asi que esto solo se dispara por un cambio
            // de otra persona (u otra pestana). Solo para cambios sobre una
            // tarea que ya esta a la vista, no para altas ni bajas.
            if (
              message.taskId &&
              (message.type === "TASK_UPDATED" ||
                message.type === "TASK_MOVED" ||
                message.type === "TASK_LABEL_UPDATED")
            ) {
              useRealtimeHighlightStore.getState().pulse(message.taskId);
            }

            // Cambiar una definicion cambia lo que el detalle y las tarjetas
            // tienen que pintar, asi que se invalidan las dos cosas: la lista
            // de campos y las tareas que los llevan dentro.
            if (message.type === "FIELD_DEFINITION_UPDATED") {
              queryClient.invalidateQueries({
                queryKey: ["field-definitions", message.projectId],
              });
              return;
            }

            // Los contadores de una epica (`taskCount`, `doneTaskCount`) los
            // calcula `getEpics` sobre `task_epic`, asi que cambian tambien
            // cuando se cuelga o descuelga una tarea, cuando se crea o borra
            // una, y cuando la cascada cierra media rama —no solo cuando se
            // edita la epica—. Esa consulta no tiene refresco automatico, asi
            // que sin esto el editor de epicas se quedaba en "3/8" para
            // siempre. Es barata y por proyecto.
            queryClient.invalidateQueries({
              queryKey: ["epics", message.projectId],
            });

            // Guardar, compartir o retirar una vista no cambia ninguna tarea:
            // se invalida su lista y no hay mas que hacer.
            if (message.type === "VIEW_UPDATED") {
              queryClient.invalidateQueries({
                queryKey: ["views", message.projectId],
              });
              return;
            }

            if (message.type === "EPIC_UPDATED") {
              return;
            }

            if (message.type === "TASK_RELATION_UPDATED") {
              // La capa de dependencias del Gantt lee las relaciones por
              // proyecto, con su propia clave; las invalidaciones por tarea de
              // abajo no la alcanzan.
              queryClient.invalidateQueries({
                queryKey: ["task-relations", "project", message.projectId],
              });
              if (message.sourceTaskId) {
                queryClient.invalidateQueries({
                  queryKey: ["task", message.sourceTaskId],
                });
                queryClient.invalidateQueries({
                  queryKey: ["task-relations", message.sourceTaskId],
                });
              }
              if (message.targetTaskId) {
                queryClient.invalidateQueries({
                  queryKey: ["task", message.targetTaskId],
                });
                queryClient.invalidateQueries({
                  queryKey: ["task-relations", message.targetTaskId],
                });
              }
              if (!message.sourceTaskId && !message.targetTaskId) {
                queryClient.invalidateQueries({
                  queryKey: ["task-relations"],
                });
              }
            } else {
              queryClient.invalidateQueries({
                queryKey: ["task", message.taskId],
              });

              // Reparentar cambia el agregado —progreso, fechas, contador de
              // hijas— de los **dos** padres, no solo de la tarea movida. Quien
              // tuviera abierta la tarea contenedora seguia leyendo "3/6" para
              // siempre: esa consulta no tiene refresco automatico y el cliente
              // global lleva `refetchOnMount:false`.
              for (const parentId of [
                message.oldParentId,
                message.newParentId,
              ]) {
                if (parentId) {
                  queryClient.invalidateQueries({
                    queryKey: ["task", parentId],
                  });
                }
              }
            }

            if (message.type === "TASK_LABEL_UPDATED") {
              queryClient.invalidateQueries({
                queryKey: ["labels", message.taskId],
              });
            }

            // La actividad de una tarea crece con cualquier cambio, no solo
            // con los comentarios: quien tuviera abierta la pestana de
            // Actividad no veia aparecer los cambios de estado ni de titulo.
            if (message.taskId) {
              queryClient.invalidateQueries({
                queryKey: ["activities", message.taskId],
              });
            }

            if (message.type === "COMMENT_UPDATED") {
              queryClient.invalidateQueries({
                queryKey: ["comments", message.taskId],
              });
            }
          }
        } catch {
          // Ignore malformed messages
        }
      };

      ws.onclose = () => {
        clearPing();
        wsRef.current = null;

        if (retriesRef.current < MAX_RETRIES) {
          const delay = BASE_DELAY * 2 ** retriesRef.current; // 1s, 2s, 4s, 8s, 16s
          retriesRef.current += 1;
          timeoutRef.current = setTimeout(connect, delay);
        }
      };
    }
    connect();

    return () => {
      retriesRef.current = MAX_RETRIES; // Prevent reconnect after unmount
      clearPing();
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      wsRef.current?.close();
    };
  }, [projectId, session?.user?.id, queryClient]);
}
