import { Diamond } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { useUpdateTaskMilestone } from "@/hooks/mutations/task/use-update-task-milestone";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { cn } from "@/lib/cn";
import { toast } from "@/lib/toast";
import type Task from "@/types/task";

/**
 * «Hito» en el lateral del detalle (ADR 082): una tarea con una sola fecha,
 * sin estimación ni subtareas. Una tarea con subtareas no puede serlo.
 */
export default function TaskScheduleProperty({ task }: { task: Task }) {
  const { t } = useTranslation();
  const { canUpdateTasks } = useWorkspacePermission();
  const { mutate, isPending } = useUpdateTaskMilestone();
  const hasChildren = (task.subtree?.childCount ?? 0) > 0;
  const isMilestone = Boolean(task.isMilestone);
  const disabled =
    !canUpdateTasks() || isPending || (hasChildren && !isMilestone);

  return (
    <Button
      variant="ghost"
      size="sm"
      className="justify-start h-7 px-1.5 gap-1.5 w-full"
      disabled={disabled}
      aria-pressed={isMilestone}
      data-testid="task-milestone-toggle"
      title={
        hasChildren && !isMilestone
          ? t("tasks:milestone.notWithSubtasks")
          : t("tasks:milestone.hint")
      }
      onClick={() =>
        mutate(
          {
            taskId: task.id,
            projectId: task.projectId,
            isMilestone: !isMilestone,
          },
          {
            onSuccess: () =>
              toast.success(
                isMilestone
                  ? t("tasks:milestone.unmarked")
                  : t("tasks:milestone.marked"),
              ),
            onError: (error) =>
              toast.error(
                error instanceof Error
                  ? error.message
                  : t("tasks:milestone.error"),
              ),
          },
        )
      }
    >
      <Diamond
        className={cn(
          "w-3.5 h-3.5",
          isMilestone
            ? "fill-current text-brand-strong"
            : "text-muted-foreground",
        )}
      />
      <span
        className={cn(
          "text-xs font-semibold",
          !isMilestone && "text-muted-foreground",
        )}
      >
        {isMilestone ? t("tasks:milestone.is") : t("tasks:milestone.mark")}
      </span>
    </Button>
  );
}
