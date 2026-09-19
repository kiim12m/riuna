import { useMutation, useQueryClient } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";

export function useCreateTeam() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      name,
      workspaceId,
    }: {
      name: string;
      workspaceId: string;
    }) => {
      const { data, error } = await authClient.organization.createTeam({
        name,
        organizationId: workspaceId,
      });

      if (error) {
        throw new Error(error.message || "Failed to create team");
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
