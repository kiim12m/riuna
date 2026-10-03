import { useQuery } from "@tanstack/react-query";
import { getMyLeads, listTeamLeads } from "@/fetchers/lead";

export function useMyLeads(workspaceId: string) {
  return useQuery({
    queryKey: ["my-leads", workspaceId],
    queryFn: () => getMyLeads(workspaceId),
    enabled: Boolean(workspaceId),
  });
}

export function useTeamLeads(workspaceId: string) {
  return useQuery({
    queryKey: ["team-leads", workspaceId],
    queryFn: () => listTeamLeads(workspaceId),
    enabled: Boolean(workspaceId),
  });
}
