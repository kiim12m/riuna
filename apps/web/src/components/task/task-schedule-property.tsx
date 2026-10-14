import { CalendarCog, Check, Diamond } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useUpdateTaskAutoDates } from "@/hooks/mutations/task/use-task-schedule";
import { useUpdateTaskMilestone } from "@/hooks/mutations/task/use-update-task-milestone";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { cn } from "@/lib/cn";
import { canHaveAutoDates } from "@/lib/task-dates";
import { toast } from "@/lib/toast";
import type Task from "@/types/task";

/**
 * «Fechas: propias o automáticas» (ADR 083 y 084), solo para quien tiene de
 * dónde sacarlas: un padre las toma de su rama y una sucesora, su inicio, de
 * sus predecesoras.
 */
function DatesModeProperty({ task }: { task: Task }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { canUpdateTasks } = useWorkspacePermission();
  const { mutate, isPending } = useUpdateTaskAutoDates();
  const auto = Boolean(task.autoDates);

  const choose = (autoDates: boolean) => {
    setOpen(false);
    if (autoDates === auto) return;
    mutate(
      { taskId: task.id, projectId: task.projectId, autoDates },
      {
        onError: (error) =>
          toast.error(
            error instanceof Error ? error.message : t("tasks:dates.error"),
          ),
      },
    );
  };

  const options = [
    {
      value: false,
      label: t("tasks:dates.own"),
      hint: t("tasks:dates.ownHint"),
    },
    {
      value: true,
      label: t("tasks:dates.auto"),
      hint: t("tasks:dates.autoHint"),
    },
  ];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="justify-start h-7 px-1.5 gap-1.5"
          disabled={!canUpdateTasks() || isPending}
          data-testid="task-dates-mode"
        >
          <CalendarCog className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs font-semibold">
            {auto ? t("tasks:dates.modeAuto") : t("tasks:dates.modeOwn")}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-1" align="start">
        {options.map((option) => (
          <button
            key={String(option.value)}
            type="button"
            role="menuitemradio"
            aria-checked={auto === option.value}
            className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left hover:bg-accent"
            onClick={() => choose(option.value)}
          >
            <Check
              className={cn(
                "mt-0.5 size-3.5 shrink-0",
                auto === option.value ? "opacity-100" : "opacity-0",
              )}
            />
            <span>
              <span className="block text-sm font-medium">{option.label}</span>
              <span className="block text-meta text-muted-foreground">
                {option.hint}
              </span>
            </span>
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

/**
 * Las propiedades de planificación del lateral: el modo de las fechas de un
 * padre (ADR 083) y «Hito» (ADR 082), una tarea con una sola fecha, sin
 * estimación ni subtareas. Una tarea con subtareas no puede serlo.
 */
export default function TaskScheduleProperty({ task }: { task: Task }) {
  const hasChildren = (task.subtree?.childCount ?? 0) > 0;
  return (
    <>
      {canHaveAutoDates(task) && <DatesModeProperty task={task} />}
      {(!hasChildren || task.isMilestone) && <MilestoneProperty task={task} />}
    </>
  );
}

function MilestoneProperty({ task }: { task: Task }) {
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
      className="justify-start h-7 px-1.5 gap-1.5"
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
