import { client } from "@riuna/libs";
import { filenameFromResponse } from "@/lib/download-filename";
import type { TaskFilter } from "@/types/task-filter";

/** La cartera en Excel, con el filtro que se ve (ADR 088). */
async function exportProjects(workspaceId: string, filter: TaskFilter | null) {
  const response = await client.project.export.$get({
    query: {
      workspaceId,
      ...(filter ? { filter: JSON.stringify(filter) } : {}),
    },
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return {
    blob: await response.blob(),
    filename: filenameFromResponse(response, "proyectos.xlsx"),
  };
}

export default exportProjects;
