import { useMutation, useQueryClient } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";

export function useAddTeamMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      teamId,
      userId,
    }: {
      teamId: string;
      userId: string;
    }) => {
      const { data, error } = await authClient.organization.addTeamMember({
        teamId,
        userId,
      });

      if (error) {
        throw new Error(error.message || "Failed to add team member");
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
