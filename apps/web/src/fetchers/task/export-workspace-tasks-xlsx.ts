import { client } from "@riuna/libs";
import { filenameFromResponse } from "@/lib/download-filename";

async function exportWorkspaceTasksXlsx(workspaceId: string) {
  const response = await client.task.export.servitec[":workspaceId"].$get({
    param: { workspaceId },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  return {
    blob: await response.blob(),
    filename: filenameFromResponse(response, "tareas.xlsx"),
  };
}

export default exportWorkspaceTasksXlsx;
