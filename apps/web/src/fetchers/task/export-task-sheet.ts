import { client } from "@riuna/libs";
import { filenameFromResponse } from "@/lib/download-filename";
import type { TaskFilter } from "@/types/task-filter";

// Exportar "la vista que estoy mirando" es mandarle a la API la misma busqueda
// que ya vive en la URL. Punto 3 de la ADR 015: no hay un segundo estado que
// mantener en sincronia.

export type SheetFormat = "csv" | "xlsx";

async function exportTaskSheet({
  projectId,
  format,
  filter,
  treeScope,
}: {
  projectId: string;
  format: SheetFormat;
  filter?: TaskFilter | null;
  treeScope?: "matching" | "roots" | "withDescendants";
}) {
  const response = await client.task.export[":projectId"].$get({
    param: { projectId },
    query: {
      format,
      ...(filter ? { filter: JSON.stringify(filter) } : {}),
      ...(treeScope && treeScope !== "matching" ? { treeScope } : {}),
    },
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return {
    blob: await response.blob(),
    filename: filenameFromResponse(response, `tareas.${format}`),
  };
}

export default exportTaskSheet;
