import { useQuery } from "@tanstack/react-query";
import { getCalendarFeed } from "@/fetchers/calendar";

export function useCalendarFeed(workspaceId: string) {
  return useQuery({
    queryKey: ["calendar-feed", workspaceId],
    queryFn: () => getCalendarFeed(workspaceId),
    enabled: Boolean(workspaceId),
  });
}
