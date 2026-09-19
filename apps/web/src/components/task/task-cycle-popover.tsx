import { Check, Target } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  useGetCycles,
  useUpdateTaskCycle,
} from "@/hooks/queries/cycle/use-cycles";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { toast } from "@/lib/toast";
import type Task from "@/types/task";

/**
 * El selector de ciclo de una tarea.
 *
 * Una tarea pertenece **a un ciclo o a ninguno**, al reves que las epicas, que
 * son varias: la epica dice de que va el trabajo y el ciclo dice en que quincena
 * toca. Los ciclos cerrados no se ofrecen —el servidor tambien los rechaza—
 * porque meter trabajo en un sprint cerrado cambiaria una velocidad ya
 * congelada.
 */
export default function TaskCyclePopover({
  task,
  projectId,
  children,
}: {
  task: Task & { cycleId?: string | null };
  projectId: string;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { data: cycles = [] } = useGetCycles(projectId, false);
  const { mutateAsync: updateTaskCycle } = useUpdateTaskCycle(projectId);
  const { canUpdateTasks } = useWorkspacePermission();

  if (!canUpdateTasks()) return <>{children}</>;

  const select = async (cycleId: string | null) => {
    try {
      await updateTaskCycle({ taskId: task.id, cycleId });
      setOpen(false);
    } catch {
      toast.error(t("cycles:assignError"));
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-1">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2 font-normal"
          onClick={() => select(null)}
        >
          <span className="w-4">
            {!task.cycleId && <Check className="h-3.5 w-3.5" />}
          </span>
          {t("cycles:none")}
        </Button>
        {cycles.map((cycle) => (
          <Button
            key={cycle.id}
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2 font-normal"
            onClick={() => select(cycle.id)}
          >
            <span className="w-4">
              {task.cycleId === cycle.id && <Check className="h-3.5 w-3.5" />}
            </span>
            <Target className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="truncate">{cycle.name}</span>
          </Button>
        ))}
        {cycles.length === 0 && (
          <p className="px-2 py-3 text-center text-muted-foreground text-xs">
            {t("cycles:noneAvailable")}
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}

export function TaskCycleTrigger({
  task,
  projectId,
}: {
  task: Task & { cycleId?: string | null };
  projectId: string;
}) {
  const { t } = useTranslation();
  const { data: cycles = [] } = useGetCycles(projectId);
  const current = cycles.find((cycle) => cycle.id === task.cycleId);

  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-7 justify-start gap-1.5 px-1.5"
    >
      <Target className="h-3.5 w-3.5 text-muted-foreground" />
      <span
        className={`max-w-[110px] truncate text-xs font-semibold ${
          current ? "" : "text-muted-foreground"
        }`}
      >
        {current?.name ?? t("cycles:none")}
      </span>
    </Button>
  );
}
