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
 * Tablero, Gantt y Tabla de "Mis tareas". El objeto entero entra en la clave
 * -TanStack lo serializa de forma estable- en vez de enumerar sus campos:
 * enumerarlos es lo que dejaba fuera `sortOrder`, `page` y `limit`, que
 * `queryFn` si manda, y dos paginas distintas compartian cache en silencio. El
 * prefijo `["my-work"]` que invalida el websocket (`useUserWebSocket`) sigue
 * cubriendo esta clave igual.
 */
export function useMyTasksSearch(options: SearchMyWorkOptions) {
  return useQuery({
    queryKey: ["my-work", "search", options],
    queryFn: () => searchMyWork(options),
    enabled: Boolean(options.workspaceId),
  });
}
