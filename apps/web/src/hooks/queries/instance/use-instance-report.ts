import { useQuery } from "@tanstack/react-query";
import { getInstanceReport } from "@/fetchers/instance";

// Lo que cambia —trabajos, copias, rutas— cambia en minutos, no en segundos.
const REFRESH_MS = 60_000;

export function useInstanceReport(enabled: boolean) {
  return useQuery({
    queryKey: ["instance-report"],
    queryFn: getInstanceReport,
    enabled,
    refetchInterval: REFRESH_MS,
  });
}
