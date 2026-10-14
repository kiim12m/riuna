import { client } from "@riuna/libs";
import { filenameFromResponse } from "@/lib/download-filename";
import type { TaskFilter } from "@/types/task-filter";

// Exportar "la vista que estoy mirando" es mandarle a la API la misma busqueda
// que ya vive en la URL. Punto 3 de la ADR 015: no hay un segundo estado que
// mantener en sincronia.

export type SheetFormat = "csv" | "xlsx";

/** Una hoja de calculo o, desde la 4.2, un PDF (ADR 091). */
export type ExportFormat = SheetFormat | "pdf";

async function exportTaskSheet({
  projectId,
  format,
  filter,
  treeScope,
  columns,
  title,
  subtitle,
}: {
  projectId: string;
  format: ExportFormat;
  filter?: TaskFilter | null;
  treeScope?: "matching" | "roots" | "withDescendants";
  /** Las columnas que se ven en la Tabla; solo las usa el PDF. */
  columns?: string[];
  /** La vista y su filtro en palabras, para la cabecera del PDF. */
  title?: string;
  subtitle?: string;
}) {
  const response = await client.task.export[":projectId"].$get({
    param: { projectId },
    query: {
      format,
      ...(filter ? { filter: JSON.stringify(filter) } : {}),
      ...(treeScope && treeScope !== "matching" ? { treeScope } : {}),
      ...(format === "pdf" && columns?.length
        ? { columns: columns.join(",") }
        : {}),
      ...(format === "pdf" && title ? { title } : {}),
      ...(format === "pdf" && subtitle ? { subtitle } : {}),
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
