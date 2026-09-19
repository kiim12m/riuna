import { useMutation, useQueryClient } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";

export function useRemoveTeam() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      teamId,
      workspaceId,
    }: {
      teamId: string;
      workspaceId: string;
    }) => {
      const { data, error } = await authClient.organization.removeTeam({
        teamId,
        organizationId: workspaceId,
      });

      if (error) {
        throw new Error(error.message || "Failed to remove team");
      }

      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["teams", variables.workspaceId],
      });
      // Las tareas que apuntaban al equipo quedan con team_id a null por la
      // clave foranea, asi que su cache tambien esta obsoleta.
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}
