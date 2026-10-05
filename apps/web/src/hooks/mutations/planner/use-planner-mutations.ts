import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import {
  type PlanResponse,
  removePlanEntry,
  setPlanEntry,
  setPlanOrder,
} from "@/fetchers/planner";
import { plannerQueryKey } from "@/hooks/queries/planner/use-planner";
import { dayKey } from "@/lib/day-key";

type Destination = {
  plannedDate: string;
  position?: number;
  /** Ausente: no se toca. `null`: desancla. Un numero: ancla a esa hora. */
  startMinute?: number | null;
} | null;

/**
 * Arrastrar una tarjeta escribe la cache antes de llamar a la mutacion, igual
 * que `useReorderProjects`: dnd-kit limpia su propio estado en el mismo tick
 * y un `onMutate` que llega detras pintaria el hueco vacio un render de mas.
 * `destination: null` es "sin planificar" -DELETE en vez de PUT-.
 *
 * El valor optimista no intenta adivinar `loggedSeconds`/`position` con
 * precision -por eso el `?? 0`/`?? null` a secas en vez de leerlos de donde
 * estaba la tarjeta antes, que es un union de tres formas distintas y no
 * vale la pena estrechar a mano-: `onSettled` los corrige en cuanto vuelve
 * la respuesta real, que tarda un instante.
 */
function sameDay(plannedDate: string | null | undefined, key: string) {
  if (!plannedDate) return false;
  return dayKey(new Date(plannedDate)) === key;
}

export function usePlannerMutations(
  workspaceId: string,
  days: number,
  from?: string,
) {
  const queryClient = useQueryClient();
  const queryKey = useMemo(
    () => plannerQueryKey(workspaceId, days, from),
    [workspaceId, days, from],
  );

  // Todo el Planificador del espacio, no solo esta ventana: tambien el dia
  // planificado del detalle de la tarea (`planEntryQueryKey`).
  const invalidatePlanner = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ["planner", workspaceId] }),
    [queryClient, workspaceId],
  );

  const putMutation = useMutation({
    mutationFn: ({
      taskId,
      plannedDate,
      position,
      startMinute,
    }: {
      taskId: string;
      plannedDate: string;
      position?: number;
      startMinute?: number | null;
    }) =>
      setPlanEntry(workspaceId, taskId, { plannedDate, position, startMinute }),
    onSettled: invalidatePlanner,
  });

  const deleteMutation = useMutation({
    mutationFn: ({ taskId }: { taskId: string }) =>
      removePlanEntry(workspaceId, taskId),
    onSettled: invalidatePlanner,
  });

  const orderMutation = useMutation({
    mutationFn: (input: { plannedDate: string; taskIds: string[] }) =>
      setPlanOrder(workspaceId, input),
    onSettled: invalidatePlanner,
  });

  const moveTask = useCallback(
    (taskId: string, destination: Destination) => {
      const previous = queryClient.getQueryData<PlanResponse>(queryKey);
      if (!previous) return;

      const task =
        previous.entries.find((row) => row.id === taskId) ??
        previous.previous.find((row) => row.id === taskId) ??
        previous.unplanned.find((row) => row.id === taskId);
      if (!task) return;

      const withoutTask = <T extends { id: string }>(rows: T[]) =>
        rows.filter((row) => row.id !== taskId);

      const next: PlanResponse = destination
        ? {
            ...previous,
            entries: [
              ...withoutTask(previous.entries),
              {
                ...task,
                plannedDate: destination.plannedDate,
                position: destination.position ?? 0,
                startMinute:
                  destination.startMinute !== undefined
                    ? destination.startMinute
                    : null,
                loggedSeconds:
                  (task as { loggedSeconds?: number }).loggedSeconds ?? 0,
                // Cambiar de dia la deja normal (disparador de la ADR 053);
                // en el mismo dia conserva su puesto.
                keyRank: sameDay(
                  (task as { plannedDate?: string | null }).plannedDate,
                  destination.plannedDate,
                )
                  ? ((task as { keyRank?: number | null }).keyRank ?? null)
                  : null,
              },
            ],
            previous: withoutTask(previous.previous),
            unplanned: withoutTask(previous.unplanned),
          }
        : {
            ...previous,
            entries: withoutTask(previous.entries),
            previous: withoutTask(previous.previous),
            unplanned: [...withoutTask(previous.unplanned), task],
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
            startMinute: destination.startMinute,
          },
          { onError: rollback },
        );
      } else {
        deleteMutation.mutate({ taskId }, { onError: rollback });
      }
    },
    [queryClient, queryKey, putMutation, deleteMutation],
  );

  /** Reordena "Sin hora" de un dia. `taskIds` ya viene en el orden final. */
  const reorderDay = useCallback(
    (plannedDate: string, taskIds: string[]) => {
      const previous = queryClient.getQueryData<PlanResponse>(queryKey);
      if (previous) {
        const positionByTaskId = new Map(
          taskIds.map((id, index) => [id, index]),
        );
        queryClient.setQueryData<PlanResponse>(queryKey, {
          ...previous,
          entries: previous.entries.map((entry) => {
            const position = positionByTaskId.get(entry.id);
            return position === undefined ? entry : { ...entry, position };
          }),
        });
      }
      queryClient.cancelQueries({ queryKey });

      orderMutation.mutate(
        { plannedDate, taskIds },
        {
          onError: () => {
            if (previous) queryClient.setQueryData(queryKey, previous);
          },
        },
      );
    },
    [queryClient, queryKey, orderMutation],
  );

  return { moveTask, reorderDay };
}
