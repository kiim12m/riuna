import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  type CreateCyclePayload,
  closeCycle,
  createCycle,
  deleteCycle,
  getCycleReport,
  getCycles,
  getVelocityHistory,
  type UpdateCyclePayload,
  updateCycle,
  updateTaskCycle,
} from "@/fetchers/cycle";

export function useGetCycles(projectId: string, includeClosed = true) {
  return useQuery({
    queryKey: ["cycles", projectId, includeClosed],
    queryFn: () => getCycles(projectId, includeClosed),
    enabled: Boolean(projectId),
  });
}

export function useGetVelocityHistory(projectId: string) {
  return useQuery({
    queryKey: ["cycle-velocity", projectId],
    queryFn: () => getVelocityHistory(projectId),
    enabled: Boolean(projectId),
  });
}

export function useGetCycleReport(cycleId: string | undefined) {
  return useQuery({
    queryKey: ["cycle-report", cycleId],
    queryFn: () => getCycleReport(cycleId as string),
    enabled: Boolean(cycleId),
  });
}

/**
 * Toda mutacion de ciclo invalida lo mismo, y siempre las tareas ademas de los
 * ciclos: cerrar un sprint devuelve tareas al backlog, asi que un tablero que
 * solo refrescase la lista de ciclos seguiria enseñandolas dentro.
 */
function useCycleInvalidation(projectId: string) {
  const queryClient = useQueryClient();

  return () => {
    queryClient.invalidateQueries({ queryKey: ["cycles", projectId] });
    queryClient.invalidateQueries({ queryKey: ["cycle-velocity", projectId] });
    queryClient.invalidateQueries({ queryKey: ["cycle-report"] });
    queryClient.invalidateQueries({ queryKey: ["tasks", projectId] });
  };
}

export function useCreateCycle(projectId: string) {
  const invalidate = useCycleInvalidation(projectId);

  return useMutation({
    mutationFn: (payload: CreateCyclePayload) =>
      createCycle(projectId, payload),
    onSuccess: invalidate,
  });
}

export function useUpdateCycle(projectId: string) {
  const invalidate = useCycleInvalidation(projectId);

  return useMutation({
    mutationFn: ({
      cycleId,
      ...payload
    }: UpdateCyclePayload & { cycleId: string }) =>
      updateCycle(cycleId, payload),
    onSuccess: invalidate,
  });
}

export function useCloseCycle(projectId: string) {
  const invalidate = useCycleInvalidation(projectId);

  return useMutation({
    mutationFn: ({
      cycleId,
      unfinished,
      targetCycleId,
    }: {
      cycleId: string;
      unfinished: "backlog" | "cycle";
      targetCycleId?: string;
    }) => closeCycle(cycleId, { unfinished, targetCycleId }),
    onSuccess: invalidate,
  });
}

export function useDeleteCycle(projectId: string) {
  const invalidate = useCycleInvalidation(projectId);

  return useMutation({
    mutationFn: (cycleId: string) => deleteCycle(cycleId),
    onSuccess: invalidate,
  });
}

export function useUpdateTaskCycle(projectId: string) {
  const invalidate = useCycleInvalidation(projectId);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      taskId,
      cycleId,
    }: {
      taskId: string;
      cycleId: string | null;
    }) => updateTaskCycle(taskId, cycleId),
    onSuccess: (_result, variables) => {
      invalidate();
      queryClient.invalidateQueries({ queryKey: ["task", variables.taskId] });
      queryClient.invalidateQueries({
        queryKey: ["activities", variables.taskId],
      });
    },
  });
}
