import { useMutation, useQueryClient } from "@tanstack/react-query";
import { removePlanEntry, setPlanEntry, setPlanKey } from "@/fetchers/planner";

/**
 * Planificar o sacar del plan **una** tarea desde su detalle o desde el menu
 * de su fila (ADR 053). Sin la escritura optimista de `usePlannerMutations`,
 * que reescribe la ventana entera del Planificador: aqui no hay ventana a la
 * vista, y basta con releer lo que dependa del plan -el propio detalle, el
 * Planificador, Hoy, el Cronograma y el contador de "Hoy"-.
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

  /** Ancla (o suelta, con `null`) la hora en el dia en que ya esta. */
  const anchor = useMutation({
    mutationFn: (input: { plannedDate: string; startMinute: number | null }) =>
      setPlanEntry(workspaceId, taskId, input),
    onSettled: invalidate,
  });

  const unplan = useMutation({
    mutationFn: () => removePlanEntry(workspaceId, taskId),
    onSettled: invalidate,
  });

  /** 409 si el dia ya tiene tres imprescindibles: quien llama lo avisa. */
  const setKey = useMutation({
    mutationFn: (key: boolean) => setPlanKey(workspaceId, taskId, key),
    onSettled: invalidate,
  });

  return {
    plan: plan.mutate,
    anchor: anchor.mutate,
    unplan: unplan.mutate,
    setKey: setKey.mutate,
    isPending:
      plan.isPending ||
      anchor.isPending ||
      unplan.isPending ||
      setKey.isPending,
  };
}
