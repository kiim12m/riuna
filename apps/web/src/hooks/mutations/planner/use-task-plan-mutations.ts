import { useMutation, useQueryClient } from "@tanstack/react-query";
import { removePlanEntry, setPlanEntry } from "@/fetchers/planner";

/**
 * Planificar o sacar del plan **una** tarea desde su detalle. Sin la escritura
 * optimista de `usePlannerMutations`, que reescribe la ventana entera del
 * Planificador: aqui no hay ventana a la vista, y basta con releer lo que
 * dependa del plan -el propio detalle, el Planificador, Hoy, el Cronograma y
 * el contador de "Hoy"-.
 */
export function useTaskPlanMutations(workspaceId: string, taskId: string) {
  const queryClient = useQueryClient();

  const invalidate = () => {
    for (const queryKey of [
      ["planner"],
      ["today"],
      ["schedule"],
      ["my-work", "counts"],
    ]) {
      queryClient.invalidateQueries({ queryKey });
    }
  };

  const plan = useMutation({
    mutationFn: (plannedDate: string) =>
      setPlanEntry(workspaceId, taskId, { plannedDate }),
    onSettled: invalidate,
  });

  const unplan = useMutation({
    mutationFn: () => removePlanEntry(workspaceId, taskId),
    onSettled: invalidate,
  });

  return {
    plan: plan.mutate,
    unplan: unplan.mutate,
    isPending: plan.isPending || unplan.isPending,
  };
}
