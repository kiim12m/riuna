import { useMutation, useQueryClient } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";

export function useRemoveTeamMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      teamId,
      userId,
    }: {
      teamId: string;
      userId: string;
    }) => {
      const { data, error } = await authClient.organization.removeTeamMember({
        teamId,
        userId,
      });

      if (error) {
        throw new Error(error.message || "Failed to remove team member");
      }

      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["team-members", variables.teamId],
      });
    },
  });
}
