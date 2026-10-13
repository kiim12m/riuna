import { useQuery } from "@tanstack/react-query";
import getProjectActivity from "@/fetchers/project/get-project-activity";

export function useGetProjectActivity(projectId: string) {
  return useQuery({
    queryKey: ["project-activity", projectId],
    queryFn: () => getProjectActivity(projectId),
    enabled: Boolean(projectId),
  });
}
