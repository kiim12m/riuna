import { useQuery } from "@tanstack/react-query";
import { getMyLeads, listTeamLeads } from "@/fetchers/lead";
import { personalQueryOptions } from "@/hooks/queries/personal-query-options";

/**
 * El aviso «Tu responsable ve tu plan» es la garantia de transparencia de la
 * ADR 059: se relee al volver a la pantalla o a la pestaña, como las
 * pantallas personales, para que llegue sin recargar cuando alguien marca a
 * un responsable.
 */
export function useMyLeads(workspaceId: string) {
  return useQuery({
    queryKey: ["my-leads", workspaceId],
    queryFn: () => getMyLeads(workspaceId),
    enabled: Boolean(workspaceId),
    ...personalQueryOptions,
  });
}

export function useTeamLeads(workspaceId: string) {
  return useQuery({
    queryKey: ["team-leads", workspaceId],
    queryFn: () => listTeamLeads(workspaceId),
    enabled: Boolean(workspaceId),
  });
}
