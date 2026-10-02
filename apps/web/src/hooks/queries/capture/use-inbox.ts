import { useQuery } from "@tanstack/react-query";
import { getInbox } from "@/fetchers/capture";

/**
 * La Bandeja de quien mira, o `null` si aun no la ha usado. Solo hace falta
 * para saber a que proyecto lleva la entrada de la barra lateral y cuando
 * marcarla activa: no se crea al leerla (ADR 051).
 */
export function useInbox(workspaceId: string) {
  return useQuery({
    queryKey: ["inbox", workspaceId],
    queryFn: () => getInbox(workspaceId),
    enabled: Boolean(workspaceId),
  });
}
