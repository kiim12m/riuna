import { useQuery } from "@tanstack/react-query";
import getProjectFieldDefinitions from "@/fetchers/field/get-project-field-definitions";

export function useGetFieldDefinitions(projectId: string) {
  return useQuery({
    queryKey: ["field-definitions", projectId],
    queryFn: () => getProjectFieldDefinitions(projectId),
    enabled: Boolean(projectId),
  });
}

export default useGetFieldDefinitions;
