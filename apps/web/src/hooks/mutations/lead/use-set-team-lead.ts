import { useMutation, useQueryClient } from "@tanstack/react-query";
import { setTeamLead } from "@/fetchers/lead";

export function useSetTeamLead(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { teamId: string; userId: string; isLead: boolean }) =>
      setTeamLead(workspaceId, input),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["team-leads", workspaceId] });
      queryClient.invalidateQueries({ queryKey: ["my-leads", workspaceId] });
    },
  });
}
