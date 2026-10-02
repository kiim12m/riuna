import { Check } from "lucide-react";
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ShortcutNumber } from "@/components/ui/shortcut-number";
import { useUpdateTaskPriority } from "@/hooks/mutations/task/use-update-task-status-priority";
import { useControllableOpen } from "@/hooks/use-controllable-open";
import { useNumberedShortcuts } from "@/hooks/use-numbered-shortcuts";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { getPriorityLabel } from "@/lib/i18n/domain";
import { getPriorityIcon } from "@/lib/priority";
import { toast } from "@/lib/toast";
import type Task from "@/types/task";

type TaskPriorityPopoverProps = {
  task: Task;
  children: React.ReactNode;
  /**
   * Abierto desde fuera -los atajos del detalle-. Sin ellos, el desplegable
   * lleva su propio estado, como siempre.
   */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

const priorityOptions = [
  { value: "no-priority" },
  { value: "low" },
  { value: "medium" },
  { value: "high" },
  { value: "urgent" },
];

export default function TaskPriorityPopover({
  task,
  children,
  open: openProp,
  onOpenChange,
}: TaskPriorityPopoverProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useControllableOpen(openProp, onOpenChange);
  const { mutateAsync: updateTaskPriority } = useUpdateTaskPriority();
  const { canUpdateTasks } = useWorkspacePermission();
  const canEdit = canUpdateTasks();

  const handlePriorityChange = useCallback(
    async (newPriority: string) => {
      try {
        await updateTaskPriority({
          ...task,
          priority: newPriority,
        });
        setOpen(false);
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : t("tasks:popover.priority.updateError"),
        );
      }
    },
    [t, task, updateTaskPriority, setOpen],
  );

  const shortcutOptions = useMemo(
    () =>
      priorityOptions.map((priority) => ({
        onSelect: () => handlePriorityChange(priority.value),
      })),
    [handlePriorityChange],
  );

  useNumberedShortcuts(open, shortcutOptions);

  // Read-only role: render the trigger child as a plain element so the user
  // still sees the current priority but can't open the popover.
  if (!canEdit) return <>{children}</>;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-48 p-0" align="start">
        <div>
          {priorityOptions.map((priority, index) => (
            <Button
              key={priority.value}
              variant="ghost"
              size="sm"
              className="w-full justify-start gap-2 h-8 px-2 rounded-none first:rounded-t-md last:rounded-b-md"
              onClick={() => handlePriorityChange(priority.value)}
            >
              {getPriorityIcon(priority.value)}
              <span className="text-sm">
                {getPriorityLabel(priority.value)}
              </span>
              {task.priority === priority.value ? (
                <Check className="ml-auto h-4 w-4" />
              ) : (
                <ShortcutNumber number={index + 1} />
              )}
            </Button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
