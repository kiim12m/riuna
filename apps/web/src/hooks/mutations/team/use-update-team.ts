import { useMutation, useQueryClient } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";

export function useUpdateTeam() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      teamId,
      name,
    }: {
      teamId: string;
      name: string;
      workspaceId: string;
    }) => {
      const { data, error } = await authClient.organization.updateTeam({
        teamId,
        data: { name },
      });

      if (error) {
        throw new Error(error.message || "Failed to update team");
      }

      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["teams", variables.workspaceId],
      });
    },
  });
}
