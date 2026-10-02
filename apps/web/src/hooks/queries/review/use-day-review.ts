import { useQuery } from "@tanstack/react-query";
import { getDayReview } from "@/fetchers/review";

/** El cierre guardado de un dia, para rellenar el ritual si se repite. */
export function useDayReview(workspaceId: string, date: string) {
  return useQuery({
    queryKey: ["review", "day", workspaceId, date],
    queryFn: () => getDayReview(workspaceId, date),
    enabled: Boolean(workspaceId && date),
  });
}
