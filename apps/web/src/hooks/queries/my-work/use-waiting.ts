import { useQuery } from "@tanstack/react-query";
import { getWaiting } from "@/fetchers/my-work";
import { personalQueryOptions } from "@/hooks/queries/personal-query-options";

/**
 * Bajo "my-work": `MY_WORK_INVALIDATED` la refresca cuando cambia una
 * asignacion, que es justo lo que mueve algo dentro o fuera de esta lista.
 */
export function useWaiting(workspaceId: string) {
  return useQuery({
    queryKey: ["my-work", "waiting", workspaceId],
    queryFn: () => getWaiting(workspaceId),
    enabled: Boolean(workspaceId),
    ...personalQueryOptions,
  });
}
