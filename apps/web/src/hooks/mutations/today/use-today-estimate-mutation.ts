import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import updateTaskEstimate from "@/fetchers/task/update-task-estimate";
import type { TodayEntry, TodayResponse } from "@/fetchers/today";

/**
 * Editar la estimacion desde una fila de Hoy reutiliza `PUT /task/estimate/:id`
 * -igual que `usePlannerEstimateMutation`-, pero parchea la cache de "today"
 * y refresca el Planificador y el Cronograma, que tambien la muestran
 * (ADR 045, ADR 046).
 */
export function useTodayEstimateMutation(workspaceId: string) {
  const queryClient = useQueryClient();
  const queryKey = useMemo(() => ["today", workspaceId], [workspaceId]);

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
      queryClient.invalidateQueries({ queryKey: ["planner", workspaceId] });
      queryClient.invalidateQueries({ queryKey: ["schedule", workspaceId] });
    },
  });

  const setEstimate = useCallback(
    (taskId: string, estimate: number | null) => {
      const previous = queryClient.getQueryData<TodayResponse>(queryKey);
      if (previous) {
        const patch = (rows: TodayEntry[]) =>
          rows.map((row) => (row.id === taskId ? { ...row, estimate } : row));
        queryClient.setQueryData<TodayResponse>(queryKey, {
          ...previous,
          previous: patch(previous.previous),
          planned: patch(previous.planned),
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
