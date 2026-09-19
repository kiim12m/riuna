import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createGoal,
  createTarget,
  deleteGoal,
  deleteTarget,
  getGoals,
  updateGoal,
  updateTarget,
} from "@/fetchers/goal";

/**
 * Los objetivos y su progreso.
 *
 * El progreso lo mide el servidor al leer, asi que cerrar una tarea lo mueve sin
 * ningun aviso: el intervalo es lo que lo recoge, con el mismo criterio que el
 * panel —la pantalla no es la de trabajo minuto a minuto—.
 */
export function useGetGoals(workspaceId: string) {
  return useQuery({
    queryKey: ["goals", workspaceId],
    queryFn: () => getGoals(workspaceId),
    enabled: Boolean(workspaceId),
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
}

/**
 * Toda mutacion de objetivo invalida lo mismo. Los resultados clave viven
 * dentro de la respuesta del objetivo, asi que no tienen clave propia que
 * invalidar.
 */
function useGoalInvalidation(workspaceId: string) {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ["goals", workspaceId] });
  };
}

export function useCreateGoal(workspaceId: string) {
  const invalidate = useGoalInvalidation(workspaceId);
  return useMutation({
    mutationFn: (payload: Parameters<typeof createGoal>[0]) =>
      createGoal(payload),
    onSuccess: invalidate,
  });
}

export function useUpdateGoal(workspaceId: string) {
  const invalidate = useGoalInvalidation(workspaceId);
  return useMutation({
    mutationFn: ({
      id,
      ...payload
    }: { id: string } & Parameters<typeof updateGoal>[1]) =>
      updateGoal(id, payload),
    onSuccess: invalidate,
  });
}

export function useDeleteGoal(workspaceId: string) {
  const invalidate = useGoalInvalidation(workspaceId);
  return useMutation({
    mutationFn: (id: string) => deleteGoal(id),
    onSuccess: invalidate,
  });
}

export function useCreateTarget(workspaceId: string) {
  const invalidate = useGoalInvalidation(workspaceId);
  return useMutation({
    mutationFn: ({
      goalId,
      ...payload
    }: { goalId: string } & Parameters<typeof createTarget>[1]) =>
      createTarget(goalId, payload),
    onSuccess: invalidate,
  });
}

export function useUpdateTarget(workspaceId: string) {
  const invalidate = useGoalInvalidation(workspaceId);
  return useMutation({
    mutationFn: ({
      id,
      ...payload
    }: { id: string } & Parameters<typeof updateTarget>[1]) =>
      updateTarget(id, payload),
    onSuccess: invalidate,
  });
}

export function useDeleteTarget(workspaceId: string) {
  const invalidate = useGoalInvalidation(workspaceId);
  return useMutation({
    mutationFn: (id: string) => deleteTarget(id),
    onSuccess: invalidate,
  });
}
