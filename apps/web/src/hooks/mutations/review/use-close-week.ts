import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type CloseWeekInput, closeWeek } from "@/fetchers/review";

export function useCloseWeek(workspaceId: string, start: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CloseWeekInput) => closeWeek(workspaceId, start, input),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["review"] }),
  });
}
