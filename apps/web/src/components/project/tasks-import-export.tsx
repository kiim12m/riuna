import { saveAs } from "file-saver";
import { Download, FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import type { SheetFormat } from "@/fetchers/task/export-task-sheet";
import useExportTaskSheet from "@/hooks/mutations/task/use-export-task-sheet";
import useExportTasks from "@/hooks/mutations/task/use-export-tasks";
import { toast } from "@/lib/toast";
import type { ProjectWithTasks } from "@/types/project";
import { ImportWizard } from "./import-wizard";

type TasksImportExportProps = {
  project: ProjectWithTasks;
};

export function TasksImportExport({ project }: TasksImportExportProps) {
  const { t } = useTranslation();
  const [isImportOpen, setIsImportOpen] = useState(false);

  const { mutateAsync: exportJson, isPending: isExportingJson } =
    useExportTasks();
  const { mutateAsync: exportSheet, isPending: isExportingSheet } =
    useExportTaskSheet();

  // El JSON es el respaldo heredado de Kaneo y sigue ahi: sirve para
  // reimportar un proyecto entero tal cual, sin mapeo.
  const handleExportJson = async () => {
    try {
      toast.loading(t("settings:tasksImportExport.exporting"));
      const exportData = await exportJson(project.id);

      saveAs(
        new Blob([JSON.stringify(exportData, null, 2)], {
          type: "application/json",
        }),
        `${project.slug}-tasks-export.json`,
      );

      toast.dismiss();
      toast.success(t("settings:tasksImportExport.exportSuccess"));
    } catch (error) {
      toast.dismiss();
      toast.error(t("settings:tasksImportExport.exportError"));
      console.error(error);
    }
  };

  const handleExportSheet = async (format: SheetFormat) => {
    try {
      toast.loading(t("settings:tasksImportExport.exporting"));
      const { blob, filename } = await exportSheet({
        projectId: project.id,
        format,
      });

      saveAs(blob, filename);

      toast.dismiss();
      toast.success(t("settings:tasksImportExport.exportSuccess"));
    } catch (error) {
      toast.dismiss();
      toast.error(t("settings:tasksImportExport.exportError"), {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  };

  const isExporting = isExportingJson || isExportingSheet;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => handleExportSheet("xlsx")}
          disabled={isExporting}
        >
          {isExportingSheet ? (
            <Loader2 className="animate-spin" />
          ) : (
            <FileSpreadsheet />
          )}
          {t("settings:tasksImportExport.exportXlsx")}
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={() => handleExportSheet("csv")}
          disabled={isExporting}
        >
          <Download />
          {t("settings:tasksImportExport.exportCsv")}
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={handleExportJson}
          disabled={isExporting}
        >
          {isExportingJson ? (
            <Loader2 className="animate-spin" />
          ) : (
            <Download />
          )}
          {t("settings:tasksImportExport.exportJson")}
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsImportOpen(true)}
        >
          <Upload />
          {t("settings:tasksImportExport.importTasks")}
        </Button>
      </div>

      <ImportWizard
        projectId={project.id}
        open={isImportOpen}
        onOpenChange={setIsImportOpen}
      />
    </div>
  );
}
