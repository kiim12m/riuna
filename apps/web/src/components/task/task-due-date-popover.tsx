import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useUpdateTaskDueDate } from "@/hooks/mutations/task/use-update-task-due-date";
import { useControllableOpen } from "@/hooks/use-controllable-open";
import { useEditableUntilKnown } from "@/hooks/use-workspace-permission";
import { hasDerivedDue } from "@/lib/task-dates";
import { toast } from "@/lib/toast";
import type Task from "@/types/task";

type TaskDueDatePopoverProps = {
  task: Task;
  children: React.ReactNode;
  /**
   * Abierto desde fuera -los atajos del detalle-. Sin ellos, el desplegable
   * lleva su propio estado, como siempre.
   */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export default function TaskDueDatePopover({
  task,
  children,
  open: openProp,
  onOpenChange,
}: TaskDueDatePopoverProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useControllableOpen(openProp, onOpenChange);
  const { mutateAsync: updateTaskDueDate } = useUpdateTaskDueDate();
  const canEdit = useEditableUntilKnown("updateTasks");

  const handleDateChange = async (date: Date | undefined) => {
    try {
      await updateTaskDueDate({
        ...task,
        dueDate: date?.toISOString() || null,
      });
      toast.success(t("tasks:popover.dueDate.updateSuccess"));
      setOpen(false);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("tasks:popover.dueDate.updateError"),
      );
    }
  };

  // Las fechas automaticas de un padre salen de su rama (ADR 083).
  if (!canEdit || hasDerivedDue(task)) return <>{children}</>;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="p-0" align="start">
        <Calendar
          mode="single"
          selected={task.dueDate ? new Date(task.dueDate) : undefined}
          onSelect={handleDateChange}
          disabled={
            task.startDate ? { before: new Date(task.startDate) } : undefined
          }
          className="w-full bg-popover"
        />
        {task.dueDate && (
          <div className="pt-2 border-t border-border">
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start gap-2 text-muted-foreground hover:text-foreground"
              onClick={() => handleDateChange(undefined)}
            >
              <X className="h-4 w-4" />
              {t("tasks:popover.dueDate.clear")}
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
