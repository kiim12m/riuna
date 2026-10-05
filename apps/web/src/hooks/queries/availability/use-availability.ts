import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { listHolidays, listTimeOff } from "@/fetchers/availability";
import { unavailableDayKeys } from "@/lib/work-days";

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

/**
 * Los dias en que no se trabaja —festivos del espacio y ausencias propias—
 * para saltarlos al elegir «el siguiente dia laborable». Mientras cargan, el
 * conjunto esta vacio y solo cuenta la jornada.
 */
export function useUnavailableDays(workspaceId: string) {
  const { data: holidays } = useHolidays(workspaceId);
  const { data: timeOff } = useTimeOff(workspaceId);

  return useMemo(
    () => unavailableDayKeys(holidays ?? [], timeOff ?? []),
    [holidays, timeOff],
  );
}
