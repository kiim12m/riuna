import { saveAs } from "file-saver";
import { ExportMenu } from "@/components/common/export-menu";
import exportTaskSheet from "@/fetchers/task/export-task-sheet";
import type { TaskFilter } from "@/types/task-filter";

type Props = {
  projectId: string;
  filter: TaskFilter | null;
  treeScope?: "matching" | "roots" | "withDescendants";
  /** Las columnas que se ven, solo en la Tabla. */
  columns?: string[];
  /** «Tabla · Obra en curso»: la vista y, si la hay, la guardada. */
  title: string;
  /** El filtro en palabras. */
  subtitle?: string;
};

/**
 * «Exportar» de una vista (ADR 091): la misma busqueda que se ve, como PDF,
 * Excel o CSV. La API ya exportaba con el filtro; faltaba el boton.
 */
export function ExportViewMenu({
  projectId,
  filter,
  treeScope,
  columns,
  title,
  subtitle,
}: Props) {
  return (
    <ExportMenu
      formats={["pdf", "xlsx", "csv"]}
      className="h-6 border-0 px-2"
      onExport={async (format) => {
        const { blob, filename } = await exportTaskSheet({
          projectId,
          format,
          filter,
          treeScope,
          columns,
          title,
          subtitle,
        });
        saveAs(blob, filename);
      }}
    />
  );
}
