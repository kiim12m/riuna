import { AlertTriangle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { useUpdateTaskAutoDates } from "@/hooks/mutations/task/use-task-schedule";
import { useUpdateTaskDueDate } from "@/hooks/mutations/task/use-update-task-due-date";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { formatDate } from "@/lib/format";
import { toast } from "@/lib/toast";
import type Task from "@/types/task";

/**
 * El aviso de desviación (ADR 083): un padre con fechas propias cuyas
 * subtareas acaban después de su vencimiento. Ofrece las dos salidas: mover
 * el vencimiento o pasar a fechas automáticas.
 */
export default function TaskScheduleAlert({ task }: { task: Task }) {
  const { t } = useTranslation();
  const { canUpdateTasks } = useWorkspacePermission();
  const { mutate: moveDue, isPending: moving } = useUpdateTaskDueDate();
  const { mutate: setAuto, isPending: switching } = useUpdateTaskAutoDates();
  const warning = task.schedule;
  if (!warning) return null;

  const date = formatDate(warning.branchDueDate, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  const fail = (error: unknown) =>
    toast.error(
      error instanceof Error ? error.message : t("tasks:dates.error"),
    );

  return (
    <div
      className="flex items-start gap-2.5 rounded-lg border border-destructive/35 bg-destructive/6 px-3 py-2.5 text-sm"
      data-testid="task-schedule-alert"
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive-foreground" />
      <div className="min-w-0 flex-1 space-y-2">
        <p className="font-medium">
          {t("tasks:dates.overflow", {
            date,
            count: warning.overflowWorkDays,
          })}
        </p>
        {canUpdateTasks() && (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="xs"
              disabled={moving || switching}
              onClick={() =>
                moveDue(
                  { ...task, dueDate: warning.branchDueDate },
                  { onError: fail },
                )
              }
            >
              {t("tasks:dates.moveDue", { date })}
            </Button>
            <Button
              variant="ghost"
              size="xs"
              disabled={moving || switching}
              onClick={() =>
                setAuto(
                  {
                    taskId: task.id,
                    projectId: task.projectId,
                    autoDates: true,
                  },
                  { onError: fail },
                )
              }
            >
              {t("tasks:dates.switchToAuto")}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
