import { client } from "@riuna/libs";
import type { InferRequestType } from "hono/client";
import type { TaskFilter } from "@/types/task-filter";

export type GetProjectsRequest = InferRequestType<
  (typeof client)["project"]["$get"]
>["query"];

async function getProjects({
  workspaceId,
  filter,
}: Omit<GetProjectsRequest, "filter"> & {
  /** El filtro de la cartera (ADR 088), con el motor de las vistas. */
  filter?: TaskFilter | null;
}) {
  if (!workspaceId) return;

  const response = await client.project.$get({
    query: {
      workspaceId,
      ...(filter ? { filter: JSON.stringify(filter) } : {}),
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  const data = await response.json();

  return data;
}

export default getProjects;
