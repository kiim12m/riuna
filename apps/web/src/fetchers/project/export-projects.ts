import { client } from "@riuna/libs";
import { filenameFromResponse } from "@/lib/download-filename";
import type { TaskFilter } from "@/types/task-filter";

/**
 * La cartera en Excel, con el filtro que se ve (ADR 088), o en PDF con las
 * columnas que se ven (ADR 091).
 */
async function exportProjects(
  workspaceId: string,
  filter: TaskFilter | null,
  pdf?: { columns: string[]; title: string; subtitle?: string },
) {
  const response = await client.project.export.$get({
    query: {
      workspaceId,
      ...(filter ? { filter: JSON.stringify(filter) } : {}),
      ...(pdf
        ? {
            format: "pdf" as const,
            columns: pdf.columns.join(","),
            title: pdf.title,
            ...(pdf.subtitle ? { subtitle: pdf.subtitle } : {}),
          }
        : {}),
    },
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return {
    blob: await response.blob(),
    filename: filenameFromResponse(
      response,
      pdf ? "proyectos.pdf" : "proyectos.xlsx",
    ),
  };
}

export default exportProjects;
