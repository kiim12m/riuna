import { useQuery } from "@tanstack/react-query";
import { getPlanEntry } from "@/fetchers/planner";
import { personalQueryOptions } from "@/hooks/queries/personal-query-options";

/**
 * El dia planificado de una tarea, para su detalle. Bajo el prefijo
 * `["planner"]` a proposito: `PLAN_INVALIDATED` (canal de usuario) ya lo
 * invalida, asi que moverla en el Planificador -aqui o en otra pestana- se ve
 * aqui sin cablear nada mas.
 */
/**
 * Bajo `["planner", workspaceId]`, no `["planner", "entry", ...]`: asi la
 * invalidan Hoy, el Cronograma, completar una tarea y el Planificador, que
 * apuntan a ese prefijo.
 */
export function planEntryQueryKey(workspaceId: string, taskId: string) {
  return ["planner", workspaceId, "entry", taskId] as const;
}

export function usePlanEntry(workspaceId: string, taskId: string) {
  return useQuery({
    queryKey: planEntryQueryKey(workspaceId, taskId),
    queryFn: () => getPlanEntry(workspaceId, taskId),
    enabled: Boolean(workspaceId && taskId),
    ...personalQueryOptions,
  });
}
