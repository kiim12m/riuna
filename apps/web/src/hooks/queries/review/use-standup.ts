import { useQuery } from "@tanstack/react-query";
import { getStandup } from "@/fetchers/review";
import { personalQueryOptions } from "@/hooks/queries/personal-query-options";

/** Solo se pide con el dialogo abierto: es una lectura de dos dias enteros. */
export function useStandup(workspaceId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["review", "standup", workspaceId],
    queryFn: () => getStandup(workspaceId),
    enabled: Boolean(workspaceId) && enabled,
    ...personalQueryOptions,
  });
}
