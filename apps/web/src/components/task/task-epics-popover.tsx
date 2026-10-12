import { Check, Layers } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useUpdateTaskEpics } from "@/hooks/mutations/epic/use-epic-mutations";
import useGetEpics from "@/hooks/queries/epic/use-get-epics";
import { useEditableUntilKnown } from "@/hooks/use-workspace-permission";
import { resolveEpicColor } from "@/lib/epic-color";
import { toast } from "@/lib/toast";
import type Task from "@/types/task";

type TaskEpicsPopoverProps = {
  task: Task;
  projectId: string;
  children: React.ReactNode;
};

// Se manda el conjunto entero en cada clic, no un anadir/quitar: es la misma
// forma que el selector de asignados y evita que dos pestañas se pisen.
export default function TaskEpicsPopover({
  task,
  projectId,
  children,
}: TaskEpicsPopoverProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { data: epics = [] } = useGetEpics(projectId);
  const { mutateAsync: updateTaskEpics } = useUpdateTaskEpics(projectId);
  const canEdit = useEditableUntilKnown("updateTasks");

  if (!canEdit) return <>{children}</>;

  const selectedIds = new Set((task.epics ?? []).map((epic) => epic.id));

  const toggle = async (epicId: string) => {
    const next = new Set(selectedIds);
    if (next.has(epicId)) {
      next.delete(epicId);
    } else {
      next.add(epicId);
    }

    try {
      await updateTaskEpics({ taskId: task.id, epicIds: [...next] });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("tasks:epics.updateError"),
      );
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-56 p-0" align="start">
        <div className="max-h-80 space-y-1 overflow-y-auto p-1">
          {epics.length === 0 && (
            <p className="px-2 py-3 text-center text-xs text-muted-foreground">
              {t("tasks:epics.emptyProject")}
            </p>
          )}
          {epics.map((epic) => (
            <Button
              key={epic.id}
              variant="ghost"
              size="sm"
              className="h-8 w-full justify-start gap-2 px-2"
              onClick={() => toggle(epic.id)}
            >
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full border border-border"
                style={{ backgroundColor: resolveEpicColor(epic.color) }}
              />
              <span className="truncate text-sm">{epic.name}</span>
              {selectedIds.has(epic.id) && (
                <Check className="ml-auto h-4 w-4 shrink-0" />
              )}
            </Button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Chip de epicas para el lateral de propiedades. */
export function TaskEpicsTrigger({ task }: { task: Task }) {
  const { t } = useTranslation();
  const epics = task.epics ?? [];

  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-7 justify-start gap-1.5 px-1.5"
    >
      <Layers className="h-3.5 w-3.5 text-muted-foreground" />
      <span
        className={`max-w-[110px] truncate text-xs font-semibold ${
          epics.length === 0 ? "text-muted-foreground" : ""
        }`}
      >
        {epics.length === 0
          ? t("tasks:epics.none")
          : epics.length === 1
            ? epics[0].name
            : t("tasks:epics.count", { count: epics.length })}
      </span>
    </Button>
  );
}
