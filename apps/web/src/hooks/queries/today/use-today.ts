import { useQuery } from "@tanstack/react-query";
import { getToday } from "@/fetchers/today";
import { personalQueryOptions } from "@/hooks/queries/personal-query-options";

/**
 * Clave propia bajo "today": `PLAN_INVALIDATED` y `TIMER_CHANGED` (canal de
 * usuario) invalidan exactamente este prefijo (ADR 046).
 */
export function useToday(workspaceId: string) {
  return useQuery({
    queryKey: ["today", workspaceId],
    queryFn: () => getToday(workspaceId),
    enabled: Boolean(workspaceId),
    ...personalQueryOptions,
  });
}
