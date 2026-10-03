import { useQuery } from "@tanstack/react-query";
import { getSchedule } from "@/fetchers/schedule";
import { personalQueryOptions } from "@/hooks/queries/personal-query-options";

/**
 * Clave propia bajo "schedule": `SCHEDULE_INVALIDATED` invalida este prefijo
 * cuando cambia un bloque o se ancla una hora; `PLAN_INVALIDATED` tambien lo
 * invalida (ver `use-user-websocket.ts`) porque el Cronograma lee
 * `personal_plan_entry`, no solo lo suyo.
 */
export function useSchedule(workspaceId: string, days = 7, from?: string) {
  return useQuery({
    queryKey: ["schedule", workspaceId, from, days],
    queryFn: () => getSchedule(workspaceId, days, from),
    enabled: Boolean(workspaceId),
    ...personalQueryOptions,
  });
}
