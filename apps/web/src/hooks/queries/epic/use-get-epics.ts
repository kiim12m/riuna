import { useQuery } from "@tanstack/react-query";
import getEpics from "@/fetchers/epic/get-epics";

export function useGetEpics(projectId: string) {
  return useQuery({
    queryKey: ["epics", projectId],
    queryFn: () => getEpics(projectId),
    enabled: Boolean(projectId),
  });
}

export default useGetEpics;
