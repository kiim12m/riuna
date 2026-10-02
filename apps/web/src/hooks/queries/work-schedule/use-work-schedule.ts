import { useQuery } from "@tanstack/react-query";
import { getWorkSchedule } from "@/fetchers/work-schedule";

export function useWorkSchedule({ enabled = true } = {}) {
  return useQuery({
    queryKey: ["work-schedule"],
    queryFn: () => getWorkSchedule(),
    enabled,
  });
}
