import { useQuery } from "@tanstack/react-query";
import { getWeekReview } from "@/fetchers/review";

/** La revision de una semana y sus cifras, que se rehacen en cada lectura. */
export function useWeekReview(workspaceId: string, start: string) {
  return useQuery({
    queryKey: ["review", "week", workspaceId, start],
    queryFn: () => getWeekReview(workspaceId, start),
    enabled: Boolean(workspaceId && start),
  });
}
