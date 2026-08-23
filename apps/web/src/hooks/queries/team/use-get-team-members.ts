import { useQuery } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";

function useGetTeamMembers({ teamId }: { teamId?: string }) {
  return useQuery({
    queryKey: ["team-members", teamId],
    enabled: !!teamId,
    queryFn: async () => {
      const { data, error } = await authClient.organization.listTeamMembers({
        query: { teamId },
      });

      if (error) {
        throw new Error(error.message || "Failed to get team members");
      }

      return data ?? [];
    },
  });
}

export default useGetTeamMembers;
