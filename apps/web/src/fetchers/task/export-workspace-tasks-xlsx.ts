import { client } from "@riuna/libs";

const FALLBACK_FILENAME = "tareas.xlsx";

// The API names the file in Content-Disposition; keeping the client from
// second-guessing it means the two can never drift apart.
function filenameFromResponse(response: Response) {
  const disposition = response.headers.get("Content-Disposition");
  if (!disposition) return FALLBACK_FILENAME;

  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(disposition);
  if (encoded?.[1]) {
    try {
      return decodeURIComponent(encoded[1].trim());
    } catch {
      // A malformed header is not a reason to fail the download.
    }
  }

  const plain = /filename="([^"]+)"/i.exec(disposition);
  return plain?.[1] ?? FALLBACK_FILENAME;
}

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
    filename: filenameFromResponse(response),
  };
}

export default exportWorkspaceTasksXlsx;
