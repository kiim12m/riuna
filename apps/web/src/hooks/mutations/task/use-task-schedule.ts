import { useMutation, useQueryClient } from "@tanstack/react-query";
import shiftTaskBranch from "@/fetchers/task/shift-task-branch";
import updateTaskAutoDates from "@/fetchers/task/update-task-auto-dates";

type Target = { taskId: string; projectId: string };

/**
 * Lo que mueve fechas de otras tareas (ADR 083): el WebSocket no se lo
 * reenvia a la ventana que lo hizo, asi que se refresca aqui todo el proyecto.
 */
function useRefreshProject() {
  const queryClient = useQueryClient();
  return ({ taskId, projectId }: Target) => {
    queryClient.invalidateQueries({ queryKey: ["task"] });
    queryClient.invalidateQueries({ queryKey: ["tasks", projectId] });
    queryClient.invalidateQueries({ queryKey: ["activities", taskId] });
  };
}

export function useUpdateTaskAutoDates() {
  const refresh = useRefreshProject();
  return useMutation({
    mutationFn: ({ taskId, autoDates }: Target & { autoDates: boolean }) =>
      updateTaskAutoDates(taskId, autoDates),
    onSuccess: (_, variables) => refresh(variables),
  });
}

export function useShiftTaskBranch() {
  const refresh = useRefreshProject();
  return useMutation({
    mutationFn: ({ taskId, startDate }: Target & { startDate: string }) =>
      shiftTaskBranch(taskId, startDate),
    onSettled: (_, __, variables) => refresh(variables),
  });
}
