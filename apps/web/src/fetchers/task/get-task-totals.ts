import { client } from "@riuna/libs";
import { HttpError } from "@/lib/http-error";
import type { TaskFilter } from "@/types/task-filter";
import type { TaskQueryOptions } from "./get-tasks";

/** Los totales de la Tabla sobre todo el filtro (ADR 080). */
async function getTaskTotals(
  projectId: string,
  filter?: TaskFilter | null,
  options?: TaskQueryOptions,
) {
  const response = await client.task.tasks[":projectId"].totals.$get({
    param: { projectId },
    query: {
      ...(filter ? { filter: JSON.stringify(filter) } : {}),
      ...(options?.treeScope && options.treeScope !== "matching"
        ? { treeScope: options.treeScope }
        : {}),
      ...(options?.includeSubprojects
        ? { includeSubprojects: "true" as const }
        : {}),
    },
  });

  if (!response.ok) {
    throw new HttpError(await response.text(), response.status);
  }

  return response.json();
}

export type TaskTotals = Awaited<ReturnType<typeof getTaskTotals>>;

export default getTaskTotals;
