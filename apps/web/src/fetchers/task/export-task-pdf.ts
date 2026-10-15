import { client } from "@riuna/libs";
import { filenameFromResponse } from "@/lib/download-filename";

/** Una tarea en PDF (ADR 091): ficha, descripcion, subtareas y comentarios. */
async function exportTaskPdf(taskId: string) {
  const response = await client.task[":id"].pdf.$get({
    param: { id: taskId },
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return {
    blob: await response.blob(),
    filename: filenameFromResponse(response, "tarea.pdf"),
  };
}

export default exportTaskPdf;
