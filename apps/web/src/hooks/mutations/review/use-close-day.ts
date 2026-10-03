import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type CloseDayInput, closeDay } from "@/fetchers/review";

/**
 * Cerrar el dia mueve o saca del plan lo pendiente, asi que relee todo lo
 * que lee el plan, ademas del propio cierre.
 */
export function useCloseDay(workspaceId: string, date: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CloseDayInput) => closeDay(workspaceId, date, input),
    onSettled: () => {
      for (const queryKey of [
        ["today"],
        ["planner"],
        ["schedule"],
        ["my-work", "counts"],
        ["review"],
      ]) {
        queryClient.invalidateQueries({ queryKey });
      }
    },
  });
}
