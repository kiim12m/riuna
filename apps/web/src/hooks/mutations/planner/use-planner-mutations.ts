import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import {
  type PlanResponse,
  removePlanEntry,
  setPlanEntry,
} from "@/fetchers/planner";

type Destination = { plannedDate: string; position: number } | null;

/**
 * Arrastrar una tarjeta escribe la cache antes de llamar a la mutacion, igual
 * que `useReorderProjects`: dnd-kit limpia su propio estado en el mismo tick
 * y un `onMutate` que llega detras pintaria el hueco vacio un render de mas.
 * `destination: null` es "sin planificar" -DELETE en vez de PUT-.
 */
export function usePlannerMutations(workspaceId: string, days: number) {
  const queryClient = useQueryClient();
  const queryKey = useMemo(
    () => ["planner", workspaceId, days],
    [workspaceId, days],
  );

  const putMutation = useMutation({
    mutationFn: ({
      taskId,
      plannedDate,
      position,
    }: {
      taskId: string;
      plannedDate: string;
      position: number;
    }) => setPlanEntry(workspaceId, taskId, { plannedDate, position }),
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  });

  const deleteMutation = useMutation({
    mutationFn: ({ taskId }: { taskId: string }) =>
      removePlanEntry(workspaceId, taskId),
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  });

  const moveTask = useCallback(
    (taskId: string, destination: Destination) => {
      const previous = queryClient.getQueryData<PlanResponse>(queryKey);
      if (!previous) return;

      const task =
        previous.entries.find((row) => row.id === taskId) ??
        previous.unplanned.find((row) => row.id === taskId);
      if (!task) return;

      const entriesWithout = previous.entries.filter(
        (row) => row.id !== taskId,
      );
      const unplannedWithout = previous.unplanned.filter(
        (row) => row.id !== taskId,
      );

      const next: PlanResponse = destination
        ? {
            ...previous,
            entries: [...entriesWithout, { ...task, ...destination }],
            unplanned: unplannedWithout,
          }
        : {
            ...previous,
            entries: entriesWithout,
            unplanned: [...unplannedWithout, task],
          };

      queryClient.setQueryData(queryKey, next);
      queryClient.cancelQueries({ queryKey });

      const rollback = () => queryClient.setQueryData(queryKey, previous);

      if (destination) {
        putMutation.mutate(
          {
            taskId,
            plannedDate: destination.plannedDate,
            position: destination.position,
          },
          { onError: rollback },
        );
      } else {
        deleteMutation.mutate({ taskId }, { onError: rollback });
      }
    },
    [queryClient, queryKey, putMutation, deleteMutation],
  );

  return { moveTask };
}
