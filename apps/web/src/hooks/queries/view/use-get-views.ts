import { useQuery } from "@tanstack/react-query";
import getProjectViews, {
  type ViewType,
} from "@/fetchers/view/get-project-views";

export function useGetViews(projectId: string, type?: ViewType) {
  return useQuery({
    queryKey: ["views", projectId, type ?? "all"],
    queryFn: () => getProjectViews(projectId, type),
    enabled: Boolean(projectId),
  });
}

export default useGetViews;
