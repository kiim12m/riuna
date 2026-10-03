import { useQuery } from "@tanstack/react-query";
import { getPlan } from "@/fetchers/planner";
import { personalQueryOptions } from "@/hooks/queries/personal-query-options";

/**
 * Clave propia bajo "planner": `PLAN_INVALIDATED` (canal de usuario) invalida
 * exactamente este prefijo, no el de "my-work" -mover una tarea en el plan no
 * cambia nada de lo que esas consultas miran.
 */
export function usePlanner(workspaceId: string, days = 15, from?: string) {
  return useQuery({
    queryKey: plannerQueryKey(workspaceId, days, from),
    queryFn: () => getPlan(workspaceId, days, from),
    enabled: Boolean(workspaceId),
    ...personalQueryOptions,
  });
}

/**
 * La clave de una ventana del Planificador. `from` ausente es "desde hoy", y
 * se guarda como tal para que la ventana por defecto siga siendo la misma
 * entrada de cache al cambiar de dia (ADR 053).
 */
export function plannerQueryKey(
  workspaceId: string,
  days: number,
  from?: string,
) {
  return ["planner", workspaceId, days, from ?? "today"] as const;
}
