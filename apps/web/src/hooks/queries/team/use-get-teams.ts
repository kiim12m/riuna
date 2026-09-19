import { useQuery } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";

type GetTeamsRequest = {
  workspaceId?: string;
};

// Los equipos los gestiona el plugin de organizacion de Better Auth, no un
// modulo propio de la API: se leen por su cliente, como los miembros.
function useGetTeams({ workspaceId }: GetTeamsRequest) {
  return useQuery({
    queryKey: ["teams", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data, error } = await authClient.organization.listTeams({
        query: {
          organizationId: workspaceId,
        },
      });

      if (error) {
        throw new Error(error.message || "Failed to get teams");
      }

      return data ?? [];
    },
  });
}

export default useGetTeams;
