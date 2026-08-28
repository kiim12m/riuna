import { useQuery } from "@tanstack/react-query";
import getTasks from "@/fetchers/task/get-tasks";
import type { TaskFilter } from "@/types/task-filter";

export function useGetTasks(projectId: string, filter?: TaskFilter | null) {
  return useQuery({
    // El filtro entra en la clave: sin el, cambiar de filtro serviria la
    // respuesta cacheada del anterior. Va detras de `projectId` para que la
    // invalidacion por WebSocket, que usa `["tasks", projectId]`, siga
    // alcanzando todas las variantes por prefijo.
    queryKey: ["tasks", projectId, filter ? JSON.stringify(filter) : null],
    queryFn: () => getTasks(projectId, filter),
    refetchInterval: 30000,
    enabled: !!projectId,
  });
}
