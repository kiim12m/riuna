import { useQuery } from "@tanstack/react-query";
import { getPlan } from "@/fetchers/planner";

/**
 * Clave propia bajo "planner": `PLAN_INVALIDATED` (canal de usuario) invalida
 * exactamente este prefijo, no el de "my-work" -mover una tarea en el plan no
 * cambia nada de lo que esas consultas miran.
 */
export function usePlanner(workspaceId: string, days = 15) {
  return useQuery({
    queryKey: ["planner", workspaceId, days],
    queryFn: () => getPlan(workspaceId, days),
    enabled: Boolean(workspaceId),
  });
}
