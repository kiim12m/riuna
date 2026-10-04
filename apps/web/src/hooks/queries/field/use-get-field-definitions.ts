import { useQuery } from "@tanstack/react-query";
import getProjectFieldDefinitions from "@/fetchers/field/get-project-field-definitions";
import getWorkspaceFieldDefinitions from "@/fetchers/field/get-workspace-field-definitions";

export function useGetFieldDefinitions(projectId: string) {
  return useQuery({
    queryKey: ["field-definitions", projectId],
    queryFn: () => getProjectFieldDefinitions(projectId),
    enabled: Boolean(projectId),
  });
}

export function useGetWorkspaceFieldDefinitions(workspaceId: string) {
  return useQuery({
    queryKey: ["field-definitions", "workspace", workspaceId],
    queryFn: () => getWorkspaceFieldDefinitions(workspaceId),
    enabled: Boolean(workspaceId),
  });
}

export default useGetFieldDefinitions;
