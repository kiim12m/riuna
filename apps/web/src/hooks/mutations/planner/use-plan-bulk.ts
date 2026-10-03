import { useMutation, useQueryClient } from "@tanstack/react-query";
import { planBulk } from "@/fetchers/planner";

/** Varias tareas a un dia de una vez, o fuera del plan (ADR 053). */
export function usePlanBulk(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { taskIds: string[]; plannedDate: string | null }) =>
      planBulk(workspaceId, input),
    onSettled: () => {
      for (const queryKey of [
        ["planner"],
        ["today"],
        ["schedule"],
        ["my-work", "counts"],
      ]) {
        queryClient.invalidateQueries({ queryKey });
      }
    },
  });
}
