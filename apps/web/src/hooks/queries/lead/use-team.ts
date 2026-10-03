import { useQuery } from "@tanstack/react-query";
import { getTeamDay, getTeamMembers, getTeamStandup } from "@/fetchers/lead";

/**
 * La vista del responsable no tiene tiempo real (aplazado a sabiendas): se
 * relee cada minuto mientras esta abierta.
 */
const TEAM_POLL_MS = 60 * 1000;

export function useTeamMembers(workspaceId: string) {
  return useQuery({
    queryKey: ["lead", "members", workspaceId],
    queryFn: () => getTeamMembers(workspaceId),
    enabled: Boolean(workspaceId),
  });
}

export function useTeamDay(workspaceId: string, date?: string) {
  return useQuery({
    queryKey: ["lead", "day", workspaceId, date ?? "today"],
    queryFn: () => getTeamDay(workspaceId, date),
    enabled: Boolean(workspaceId),
    refetchInterval: TEAM_POLL_MS,
  });
}

export function useTeamStandup(workspaceId: string, enabled = true) {
  return useQuery({
    queryKey: ["lead", "standup", workspaceId],
    queryFn: () => getTeamStandup(workspaceId),
    enabled: Boolean(workspaceId) && enabled,
    refetchInterval: TEAM_POLL_MS,
  });
}
