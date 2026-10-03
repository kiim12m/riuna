import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import type { RunningTimeEntryResponse } from "@/fetchers/time-entry/get-running-time-entry";
import startTimer from "@/fetchers/time-entry/start-timer";
import stopTimer from "@/fetchers/time-entry/stop-timer";
import type { FocusMode } from "@/lib/focus/machine";

type StartableTask = {
  id: string;
  number: number | null;
  title: string;
  projectId: string;
  estimate: number | null;
};

/**
 * Arrancar y parar escriben la cache antes de llamar a la mutacion, igual que
 * `usePlannerMutations`: el pie de la barra tiene que cambiar en el mismo
 * tick del clic, no en el que tarde la vuelta a la API. `task` lo trae quien
 * llama -la fila de Hoy o la tarjeta del Planificador ya lo tienen a mano-,
 * porque la API que arranca solo devuelve la fila de `time_entry`, sin el
 * titulo ni el proyecto que el pie necesita pintar.
 */
export function useTimerMutations(workspaceId: string) {
  const queryClient = useQueryClient();
  const queryKey = useMemo(
    () => ["time-entry", "running", workspaceId],
    [workspaceId],
  );

  const invalidateAffected = useCallback(() => {
    queryClient.invalidateQueries({ queryKey });
    queryClient.invalidateQueries({ queryKey: ["today"] });
    queryClient.invalidateQueries({ queryKey: ["schedule"] });
    queryClient.invalidateQueries({ queryKey: ["planner"] });
    queryClient.invalidateQueries({ queryKey: ["time-sheet"] });
  }, [queryClient, queryKey]);

  const startMutation = useMutation({
    mutationFn: ({
      taskId,
      focusMode,
    }: {
      taskId: string;
      focusMode?: FocusMode;
    }) => startTimer(taskId, focusMode),
    onSettled: invalidateAffected,
  });

  const stopMutation = useMutation({
    mutationFn: (endTime: string | undefined) => stopTimer(endTime),
    onSettled: invalidateAffected,
  });

  const start = useCallback(
    (task: StartableTask, focusMode?: FocusMode) => {
      const previous =
        queryClient.getQueryData<RunningTimeEntryResponse>(queryKey);
      queryClient.cancelQueries({ queryKey });
      const now = new Date().toISOString();
      queryClient.setQueryData<RunningTimeEntryResponse>(queryKey, {
        running: {
          id: `optimistic-${task.id}`,
          startTime: now,
          task,
          loggedBeforeSeconds: 0,
          // Cambiar de tarea no es descansar; lo exacto llega al invalidar.
          workingSince: previous?.running?.workingSince ?? now,
        },
        last: null,
        lastStoppedAt: null,
      });

      startMutation.mutate(
        { taskId: task.id, focusMode },
        { onError: () => queryClient.setQueryData(queryKey, previous) },
      );
    },
    [queryClient, queryKey, startMutation],
  );

  const stop = useCallback(
    (endTime?: string) => {
      const previous =
        queryClient.getQueryData<RunningTimeEntryResponse>(queryKey);
      queryClient.cancelQueries({ queryKey });
      queryClient.setQueryData<RunningTimeEntryResponse>(queryKey, {
        running: null,
        last: previous?.last ?? null,
        lastStoppedAt: endTime ?? new Date().toISOString(),
      });

      stopMutation.mutate(endTime, {
        onError: () => queryClient.setQueryData(queryKey, previous),
      });
    },
    [queryClient, queryKey, stopMutation],
  );

  return {
    start,
    stop,
    isStarting: startMutation.isPending,
    isStopping: stopMutation.isPending,
  };
}
