import { useQuery } from "@tanstack/react-query";
import { listHolidays, listTimeOff } from "@/fetchers/availability";

export function useTimeOff(workspaceId: string) {
  return useQuery({
    queryKey: ["time-off", workspaceId],
    queryFn: () => listTimeOff(workspaceId),
    enabled: Boolean(workspaceId),
  });
}

export function useHolidays(workspaceId: string) {
  return useQuery({
    queryKey: ["holidays", workspaceId],
    queryFn: () => listHolidays(workspaceId),
    enabled: Boolean(workspaceId),
  });
}
