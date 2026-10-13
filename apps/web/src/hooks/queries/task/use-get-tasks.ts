import { useQuery } from "@tanstack/react-query";
import getTasks, { type TaskQueryOptions } from "@/fetchers/task/get-tasks";
import type { TaskFilter } from "@/types/task-filter";

export function useGetTasks(
  projectId: string,
  filter?: TaskFilter | null,
  options?: TaskQueryOptions,
) {
  return useQuery({
    // El filtro y el alcance entran en la clave: sin ellos, cambiar de filtro
    // serviria la respuesta cacheada del anterior. Van detras de `projectId`
    // para que la invalidacion por WebSocket, que usa `["tasks", projectId]`,
    // siga alcanzando todas las variantes por prefijo.
    queryKey: [
      "tasks",
      projectId,
      filter ? JSON.stringify(filter) : null,
      options?.treeScope ?? "matching",
      options?.includeSubprojects ? "subprojects" : null,
    ],
    queryFn: () => getTasks(projectId, filter, options),
    // Al teclear en el buscador o marcar un menu la clave cambia en cada paso:
    // sin esto el tablero parpadearia a esqueleto en cada uno. Solo se
    // reaprovecha lo del mismo proyecto.
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[1] === projectId ? previous : undefined,
    refetchInterval: 30000,
    enabled: !!projectId,
  });
}
