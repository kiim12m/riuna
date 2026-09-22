import { useQuery } from "@tanstack/react-query";
import { searchMyWork } from "@/fetchers/my-work";

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
