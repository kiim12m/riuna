import { useQuery } from "@tanstack/react-query";
import { type SearchMyWorkOptions, searchMyWork } from "@/fetchers/my-work";

/**
 * Clave bajo `"my-work"` a proposito: `useUserWebSocket` ya invalida ese
 * prefijo entero cuando `MY_WORK_INVALIDATED` llega por el canal de usuario
 * (asignar o desasignar una tarea, por ejemplo), asi que esta lectura queda
 * en tiempo real sin tocar el websocket.
 */
export function useSearchMyWork(workspaceId: string) {
  return useQuery({
    queryKey: ["my-work", "search", workspaceId, "assigned"],
    queryFn: () =>
      searchMyWork({ workspaceId, scope: "assigned", sortBy: "smart" }),
    enabled: Boolean(workspaceId),
  });
}

/**
 * La misma lectura, con filtro, orden y ambito elegibles: lo que usan Lista,
 * Tablero, Gantt y Tabla de "Mis tareas". `filter` entra entero en la clave
 * —TanStack Query lo serializa igual que cualquier otro valor— para que dos
 * filtros distintos no compartan cache.
 */
export function useMyTasksSearch(options: SearchMyWorkOptions) {
  const { workspaceId, scope, projectId, filter, includeDone, sortBy } =
    options;

  return useQuery({
    queryKey: [
      "my-work",
      "search",
      workspaceId,
      scope,
      projectId ?? null,
      filter ?? null,
      includeDone ?? false,
      sortBy ?? "smart",
    ],
    queryFn: () => searchMyWork(options),
    enabled: Boolean(workspaceId),
  });
}
