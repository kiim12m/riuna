import { saveAs } from "file-saver";
import { Copy, FileDown, GitBranch, Loader2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { KbdSequence } from "@/components/ui/kbd";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import exportTaskPdf from "@/fetchers/task/export-task-pdf";
import useGetProject from "@/hooks/queries/project/use-get-project";
import useGetProjects from "@/hooks/queries/project/use-get-projects";
import useGetTask from "@/hooks/queries/task/use-get-task";
import { cn } from "@/lib/cn";
import { toast } from "@/lib/toast";
import TaskMovePopover from "./task-move-popover";
import TaskReminderButton from "./task-reminder-button";
import TaskWatchersButton from "./task-watchers-button";

function generateBranchName(
  projectSlug: string | undefined,
  taskNumber: number | null | undefined,
): string {
  if (!projectSlug || !taskNumber) return "";
  return `${projectSlug.toLowerCase()}-${taskNumber}`;
}

type TaskActionsProps = {
  taskId: string;
  projectId: string;
  workspaceId: string;
  /** Sin la palabra en «Recuérdamelo» y «Observando», donde no cabe. */
  iconOnly?: boolean;
  className?: string;
};

/**
 * Las acciones sobre la tarea -recordar, observar, mover, copiar enlace y
 * rama-. Van en la cabecera del cajon, en la de la pagina completa por debajo
 * de `lg` y en la del lateral de escritorio: un solo componente para que las
 * tres no vuelvan a divergir.
 */
export default function TaskActions({
  taskId,
  projectId,
  workspaceId,
  iconOnly = false,
  className,
}: TaskActionsProps) {
  const { t } = useTranslation();
  const { data: task } = useGetTask(taskId);
  const { data: project } = useGetProject({ id: projectId, workspaceId });
  const { data: workspaceProjects = [] } = useGetProjects({ workspaceId });
  const canMoveTask =
    Boolean(task) && workspaceProjects.some((p) => p.id !== task?.projectId);

  const handleCopyTaskLink = () => {
    navigator.clipboard.writeText(
      `${window.location.origin}/dashboard/workspace/${workspaceId}/project/${projectId}/task/${taskId}`,
    );
    toast.message(t("tasks:properties.copyTaskLink"));
  };

  const handleCopyTaskBranch = () => {
    navigator.clipboard.writeText(
      generateBranchName(project?.slug, task?.number),
    );
    toast.message(t("tasks:properties.copyTaskBranch"));
  };

  const [exporting, setExporting] = useState(false);
  const handleExportPdf = async () => {
    setExporting(true);
    try {
      const { blob, filename } = await exportTaskPdf(taskId);
      saveAs(blob, filename);
    } catch (error) {
      toast.error(t("tasks:export.failed"), {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <TaskReminderButton taskId={taskId} iconOnly={iconOnly} />
      <TaskWatchersButton
        taskId={taskId}
        workspaceId={workspaceId}
        iconOnly={iconOnly}
      />
      <div className="flex">
        {task && canMoveTask && (
          <TaskMovePopover
            task={task}
            workspaceId={workspaceId}
            triggerClassName="rounded-l-md rounded-r-none border-r-0"
          />
        )}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className={cn(
                  "text-foreground border-r-0",
                  canMoveTask ? "rounded-none" : "rounded-r-none",
                )}
                onClick={handleCopyTaskLink}
                aria-label={t("tasks:properties.copyTaskLink")}
              >
                <Copy className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <KbdSequence
                keys={["Ctrl", "Shift", "C"]}
                description={t("tasks:properties.copyTaskLink")}
                separator=""
              />
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="text-foreground rounded-none border-r-0"
                onClick={handleCopyTaskBranch}
                aria-label={t("tasks:properties.copyTaskBranch")}
              >
                <GitBranch className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <KbdSequence
                keys={["Ctrl", "Shift", "G"]}
                description={t("tasks:properties.copyTaskBranch")}
                separator=""
              />
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="text-foreground rounded-l-none"
                onClick={handleExportPdf}
                disabled={exporting}
                aria-label={t("tasks:export.taskPdf")}
                data-testid="task-export-pdf"
              >
                {exporting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <FileDown className="size-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("tasks:export.taskPdf")}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </div>
  );
}
