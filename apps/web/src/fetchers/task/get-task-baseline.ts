import { client } from "@riuna/libs";
import { HttpError } from "@/lib/http-error";
import type { TaskFilter } from "@/types/task-filter";
import type { TaskQueryOptions } from "./get-tasks";

/** La vista comparada con un momento pasado (ADR 085). */
async function getTaskBaseline(
  projectId: string,
  at: string,
  filter?: TaskFilter | null,
  options?: TaskQueryOptions,
) {
  const response = await client.task.tasks[":projectId"].baseline.$get({
    param: { projectId },
    query: {
      at,
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

export type TaskBaseline = Awaited<ReturnType<typeof getTaskBaseline>>;

export default getTaskBaseline;
