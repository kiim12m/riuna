import { useQuery } from "@tanstack/react-query";
import { getWatching } from "@/fetchers/my-work";
import { personalQueryOptions } from "@/hooks/queries/personal-query-options";

/**
 * Bajo "my-work": `MY_WORK_INVALIDATED` la refresca cuando alguien entra o
 * sale de lo que observo. Lo que cambia dentro de una tarea observada llega
 * al volver a la pantalla, como en el resto de pantallas personales.
 */
export function useWatching(workspaceId: string) {
  return useQuery({
    queryKey: ["my-work", "watching", workspaceId],
    queryFn: () => getWatching(workspaceId),
    enabled: Boolean(workspaceId),
    ...personalQueryOptions,
  });
}
