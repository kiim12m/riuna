import { saveAs } from "file-saver";
import { Download, Loader2, Upload } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import useExportWorkspaceTasksXlsx from "@/hooks/mutations/task/use-export-workspace-tasks-xlsx";
import { toast } from "@/lib/toast";
import { ServitecImportWizard } from "./servitec-import-wizard";

type WorkspaceTasksExportProps = {
  workspaceId: string;
};

export function WorkspaceTasksExport({
  workspaceId,
}: WorkspaceTasksExportProps) {
  const { t } = useTranslation();
  const { mutateAsync: exportTasks, isPending } = useExportWorkspaceTasksXlsx();
  const [importing, setImporting] = useState(false);

  const handleExport = async () => {
    const loadingToast = toast.loading(
      t("settings:workspaceTasksExport.exporting"),
    );
    try {
      const { blob, filename } = await exportTasks(workspaceId);

      saveAs(blob, filename);

      toast.dismiss(loadingToast);
      toast.success(t("settings:workspaceTasksExport.exportSuccess"));
    } catch (error) {
      toast.dismiss(loadingToast);
      toast.error(t("settings:workspaceTasksExport.exportError"));
      console.error(error);
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-md font-medium">
          {t("settings:workspaceTasksExport.title")}
        </h2>
        <p className="text-xs text-muted-foreground">
          {t("settings:workspaceTasksExport.subtitle")}
        </p>
      </div>

      <div className="space-y-4 border border-border rounded-md p-4 bg-sidebar">
        <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <div className="space-y-0.5 min-w-0">
            <p className="text-sm font-medium">
              {t("settings:workspaceTasksExport.spreadsheet")}
            </p>
            <p className="text-xs text-muted-foreground">
              {t("settings:workspaceTasksExport.spreadsheetDescription")}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            type="button"
            onClick={handleExport}
            disabled={isPending}
          >
            {isPending ? <Loader2 className="animate-spin" /> : <Download />}
            {t("settings:workspaceTasksExport.exportButton")}
          </Button>
        </div>
        <div
          data-testid="servitec-import-row"
          className="flex flex-col items-start gap-2 border-border border-t pt-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
        >
          <div className="space-y-0.5 min-w-0">
            <p className="text-sm font-medium">
              {t("settings:servitecImport.rowTitle")}
            </p>
            <p className="text-xs text-muted-foreground">
              {t("settings:servitecImport.rowDescription")}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            type="button"
            onClick={() => setImporting(true)}
          >
            <Upload />
            {t("settings:servitecImport.open")}
          </Button>
        </div>
      </div>
      {importing && (
        <ServitecImportWizard
          workspaceId={workspaceId}
          open
          onOpenChange={setImporting}
        />
      )}
    </div>
  );
}
