import { useQuery } from "@tanstack/react-query";
import { getMyWorkCounts } from "@/fetchers/my-work";
import { personalQueryOptions } from "@/hooks/queries/personal-query-options";

/**
 * Clave bajo "my-work": `MY_WORK_INVALIDATED`, `PLAN_INVALIDATED` y
 * `TIMER_CHANGED` invalidan este prefijo (`use-user-websocket.ts`), asi que
 * los contadores de la barra lateral se refrescan solos.
 */
export function useMyWorkCounts(workspaceId: string) {
  return useQuery({
    queryKey: ["my-work", "counts", workspaceId],
    queryFn: () => getMyWorkCounts(workspaceId),
    enabled: Boolean(workspaceId),
    ...personalQueryOptions,
  });
}
