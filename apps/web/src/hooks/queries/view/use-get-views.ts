import { useQuery } from "@tanstack/react-query";
import getProjectViews, {
  type ViewType,
} from "@/fetchers/view/get-project-views";
import getWorkspaceViews from "@/fetchers/view/get-workspace-views";

export function useGetViews(projectId: string, type?: ViewType) {
  return useQuery({
    queryKey: ["views", projectId, type ?? "all"],
    queryFn: () => getProjectViews(projectId, type),
    enabled: Boolean(projectId),
  });
}

// Clave de cache separada de `["views", projectId, ...]`: una vista de
// espacio tambien sale en el listado de cada proyecto (`getViews` las mezcla
// a proposito), pero esta consulta es la del selector de "Mis tareas", no la
// de un proyecto.
export function useGetWorkspaceViews(workspaceId: string, type?: ViewType) {
  return useQuery({
    queryKey: ["workspace-views", workspaceId, type ?? "all"],
    queryFn: () => getWorkspaceViews(workspaceId, type),
    enabled: Boolean(workspaceId),
  });
}

export default useGetViews;
