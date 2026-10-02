import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import type { PlanEntry, PlanResponse } from "@/fetchers/planner";
import updateTaskEstimate from "@/fetchers/task/update-task-estimate";
import { plannerQueryKey } from "@/hooks/queries/planner/use-planner";

/**
 * Editar la estimacion desde una tarjeta del Planificador reutiliza
 * `PUT /task/estimate/:id` -no hace falta una ruta nueva-, pero con sus
 * propios efectos de cache: actualiza la carga del dia al momento y
 * refresca Hoy y el Cronograma, que tambien la muestran (ADR 045).
 */
export function usePlannerEstimateMutation(
  workspaceId: string,
  days: number,
  from?: string,
) {
  const queryClient = useQueryClient();
  const queryKey = useMemo(
    () => plannerQueryKey(workspaceId, days, from),
    [workspaceId, days, from],
  );

  const mutation = useMutation({
    mutationFn: ({
      taskId,
      estimate,
    }: {
      taskId: string;
      estimate: number | null;
    }) => updateTaskEstimate(taskId, estimate),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: ["today"] });
      queryClient.invalidateQueries({ queryKey: ["schedule"] });
    },
  });

  const setEstimate = useCallback(
    (taskId: string, estimate: number | null) => {
      const previous = queryClient.getQueryData<PlanResponse>(queryKey);
      if (previous) {
        const patch = (rows: PlanEntry[]) =>
          rows.map((row) => (row.id === taskId ? { ...row, estimate } : row));
        queryClient.setQueryData<PlanResponse>(queryKey, {
          ...previous,
          entries: patch(previous.entries),
          previous: patch(previous.previous),
        });
      }
      queryClient.cancelQueries({ queryKey });

      mutation.mutate(
        { taskId, estimate },
        {
          onError: () => {
            if (previous) queryClient.setQueryData(queryKey, previous);
          },
        },
      );
    },
    [queryClient, queryKey, mutation],
  );

  return { setEstimate };
}
