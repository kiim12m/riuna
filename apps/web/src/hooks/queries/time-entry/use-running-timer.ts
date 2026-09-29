import { useQuery } from "@tanstack/react-query";
import getRunningTimeEntry from "@/fetchers/time-entry/get-running-time-entry";

/**
 * Clave propia bajo "time-entry": `TIMER_CHANGED` (canal de usuario) invalida
 * exactamente este prefijo cuando se arranca, para o se borra el cronometro
 * -a mano o porque la tarea entro en una columna final- (ADR 044).
 */
export function useRunningTimer(workspaceId: string) {
  return useQuery({
    queryKey: ["time-entry", "running", workspaceId],
    queryFn: () => getRunningTimeEntry(workspaceId),
    enabled: Boolean(workspaceId),
  });
}
