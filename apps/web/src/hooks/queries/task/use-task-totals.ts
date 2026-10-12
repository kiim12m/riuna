import { useQuery } from "@tanstack/react-query";
import getTaskTotals from "@/fetchers/task/get-task-totals";
import type { TaskQueryOptions } from "@/fetchers/task/get-tasks";
import type { TaskFilter } from "@/types/task-filter";

/**
 * Fuera de `["tasks"]` a proposito: hay quien escribe en todas esas cachés
 * dando por hecho que guardan un proyecto con sus tareas. Para no quedarse
 * atras, la clave lleva cuando se refresco la lista (`listUpdatedAt`): cada
 * vez que la Tabla se pone al dia —un cambio propio, el WebSocket o el
 * sondeo—, los totales se vuelven a pedir con ella.
 */
export function useTaskTotals(
  projectId: string,
  filter: TaskFilter | null | undefined,
  options: TaskQueryOptions | undefined,
  listUpdatedAt: number,
) {
  return useQuery({
    queryKey: [
      "task-totals",
      projectId,
      filter ? JSON.stringify(filter) : null,
      options?.treeScope ?? "matching",
      listUpdatedAt,
    ],
    queryFn: () => getTaskTotals(projectId, filter, options),
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[1] === projectId ? previous : undefined,
    enabled: Boolean(projectId) && listUpdatedAt > 0,
  });
}
