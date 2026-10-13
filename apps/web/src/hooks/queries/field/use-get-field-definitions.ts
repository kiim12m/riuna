import { useQuery } from "@tanstack/react-query";
import getProjectFieldDefinitions from "@/fetchers/field/get-project-field-definitions";
import getWorkspaceFieldDefinitions from "@/fetchers/field/get-workspace-field-definitions";

// Todas cuelgan de ["field-definitions"]: una mutacion que invalide ese prefijo
// refresca a la vez el editor, la tabla y los filtros.
export function useGetFieldDefinitions(
  projectId: string,
  { includeArchived = false }: { includeArchived?: boolean } = {},
) {
  return useQuery({
    queryKey: includeArchived
      ? ["field-definitions", projectId, "all"]
      : ["field-definitions", projectId],
    queryFn: () => getProjectFieldDefinitions(projectId, includeArchived),
    enabled: Boolean(projectId),
  });
}

export function useGetWorkspaceFieldDefinitions(
  workspaceId: string,
  {
    includeArchived = false,
    entity = "task",
  }: { includeArchived?: boolean; entity?: "task" | "project" } = {},
) {
  // Los de proyecto (ADR 088) bajo su propia clave, dentro del mismo prefijo.
  const scope = entity === "project" ? "project-fields" : "workspace";
  return useQuery({
    queryKey: includeArchived
      ? ["field-definitions", scope, workspaceId, "all"]
      : ["field-definitions", scope, workspaceId],
    queryFn: () =>
      getWorkspaceFieldDefinitions(workspaceId, includeArchived, entity),
    enabled: Boolean(workspaceId),
  });
}

export default useGetFieldDefinitions;
