import { useQuery } from "@tanstack/react-query";
import getProjects from "@/fetchers/project/get-projects";
import type { TaskFilter } from "@/types/task-filter";

/**
 * La lista de proyectos filtrada (ADR 088). Bajo `["projects", workspaceId]`,
 * para que cualquier cambio de un proyecto la refresque como al resto.
 */
export function useGetPortfolio(
  workspaceId: string,
  filter: TaskFilter | null,
) {
  return useQuery({
    queryKey: [
      "projects",
      workspaceId,
      "portfolio",
      filter ? JSON.stringify(filter) : null,
    ],
    queryFn: () => getProjects({ workspaceId, filter }),
    placeholderData: (previous) => previous,
    enabled: Boolean(workspaceId),
  });
}
