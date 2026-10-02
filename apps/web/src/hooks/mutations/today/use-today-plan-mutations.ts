import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { setPlanEntry, setPlanOrder } from "@/fetchers/planner";
import type { TodayEntry, TodayResponse } from "@/fetchers/today";

/**
 * "Añadir a hoy" (De dias anteriores, Vence hoy o vencida) y reordenar "Plan
 * de hoy" reutilizan las mismas rutas del Planificador -`personal_plan_entry`
 * es un solo plan, no dos (ADR 040)-, pero contra la cache de "today". El
 * valor optimista no intenta adivinar `startMinute`/`loggedSeconds` con
 * precision en una fila que venia de "urgent" -que no los trae-: `onSettled`
 * los corrige en cuanto vuelve la respuesta real.
 */
export function useTodayPlanMutations(
  workspaceId: string,
  serverToday: string,
) {
  const queryClient = useQueryClient();
  const queryKey = useMemo(() => ["today", workspaceId], [workspaceId]);

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey });
    queryClient.invalidateQueries({ queryKey: ["planner", workspaceId] });
    queryClient.invalidateQueries({ queryKey: ["schedule", workspaceId] });
    queryClient.invalidateQueries({ queryKey: ["my-work"] });
  }, [queryClient, queryKey, workspaceId]);

  const putMutation = useMutation({
    mutationFn: (taskId: string) =>
      setPlanEntry(workspaceId, taskId, { plannedDate: serverToday }),
    onSettled: invalidate,
  });

  const orderMutation = useMutation({
    mutationFn: (taskIds: string[]) =>
      setPlanOrder(workspaceId, { plannedDate: serverToday, taskIds }),
    onSettled: invalidate,
  });

  const addToToday = useCallback(
    (taskId: string) => {
      const previous = queryClient.getQueryData<TodayResponse>(queryKey);
      if (previous) {
        const source =
          previous.previous.find((row) => row.id === taskId) ??
          previous.urgent.find((row) => row.id === taskId);

        if (source) {
          const entry: TodayEntry = {
            ...source,
            plannedDate: serverToday,
            position: previous.planned.length,
            startMinute:
              (source as { startMinute?: number | null }).startMinute ?? null,
            loggedSeconds:
              (source as { loggedSeconds?: number }).loggedSeconds ?? 0,
            // Viene de otro dia o de fuera del plan: nunca es imprescindible.
            keyRank: null,
          };
          queryClient.setQueryData<TodayResponse>(queryKey, {
            ...previous,
            previous: previous.previous.filter((row) => row.id !== taskId),
            urgent: previous.urgent.filter((row) => row.id !== taskId),
            planned: [...previous.planned, entry],
          });
        }
      }
      queryClient.cancelQueries({ queryKey });

      putMutation.mutate(taskId, {
        onError: () => {
          if (previous) queryClient.setQueryData(queryKey, previous);
        },
      });
    },
    [queryClient, queryKey, putMutation, serverToday],
  );

  const reorderPlanned = useCallback(
    (taskIds: string[]) => {
      const previous = queryClient.getQueryData<TodayResponse>(queryKey);
      if (previous) {
        const positionByTaskId = new Map(
          taskIds.map((id, index) => [id, index]),
        );
        queryClient.setQueryData<TodayResponse>(queryKey, {
          ...previous,
          planned: [...previous.planned].sort(
            (a, b) =>
              (positionByTaskId.get(a.id) ?? 0) -
              (positionByTaskId.get(b.id) ?? 0),
          ),
        });
      }
      queryClient.cancelQueries({ queryKey });

      orderMutation.mutate(taskIds, {
        onError: () => {
          if (previous) queryClient.setQueryData(queryKey, previous);
        },
      });
    },
    [queryClient, queryKey, orderMutation],
  );

  return { addToToday, reorderPlanned };
}
