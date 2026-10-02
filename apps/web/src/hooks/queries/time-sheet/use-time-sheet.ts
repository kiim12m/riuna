import { useQuery } from "@tanstack/react-query";
import { getTimeSheet, type TimeSheetQuery } from "@/fetchers/time-sheet";
import { personalQueryOptions } from "@/hooks/queries/personal-query-options";

export function useTimeSheet(workspaceId: string, query: TimeSheetQuery) {
  return useQuery({
    queryKey: ["time-sheet", workspaceId, query],
    queryFn: () => getTimeSheet(workspaceId, query),
    enabled: Boolean(workspaceId),
    ...personalQueryOptions,
  });
}
