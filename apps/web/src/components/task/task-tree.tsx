import { format } from "date-fns";
import { CalendarRange, ChevronUp, ListTree, Timer } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useUpdateTaskEstimate } from "@/hooks/mutations/task/use-update-task-estimate";
import { useUpdateTaskParent } from "@/hooks/mutations/task/use-update-task-parent";
import useGetTask from "@/hooks/queries/task/use-get-task";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { formatDuration, hoursToSeconds, secondsToHours } from "@/lib/duration";
import { toast } from "@/lib/toast";

type TaskTreeProps = {
  taskId: string;
  projectId: string;
};

/**
 * Lo que la tarea es dentro del arbol: de quien cuelga, que resume su rama y
 * cuanto se estimo frente a cuanto se ha registrado. Colgarla de otra se hace
 * en la lista, arrastrando o con `Tab`; aqui solo se puede descolgar, que es
 * la accion que no tiene otro sitio donde vivir.
 */
export default function TaskTree({ taskId, projectId }: TaskTreeProps) {
  const { t, i18n } = useTranslation();
  const { data: task } = useGetTask(taskId);
  const { mutateAsync: reparent, isPending: isReparenting } =
    useUpdateTaskParent();
  const { mutateAsync: saveEstimate } = useUpdateTaskEstimate();
  const { canUpdateTasks } = useWorkspacePermission();
  const canEdit = canUpdateTasks();

  const [estimateInput, setEstimateInput] = useState("");

  // El valor guardado manda mientras no se este editando: si otra pestaña
  // cambia la estimacion, este campo tiene que enterarse.
  useEffect(() => {
    setEstimateInput(
      task?.estimate ? String(secondsToHours(task.estimate)) : "",
    );
  }, [task?.estimate]);

  if (!task) return null;

  const subtree = task.subtree ?? null;
  const hasBranch = Boolean(subtree && subtree.descendantCount > 0);

  const commitEstimate = async () => {
    const trimmed = estimateInput.trim();
    const parsed = trimmed === "" ? null : Number(trimmed.replace(",", "."));

    if (parsed !== null && (Number.isNaN(parsed) || parsed < 0)) {
      setEstimateInput(
        task.estimate ? String(secondsToHours(task.estimate)) : "",
      );
      return;
    }

    const seconds = parsed === null ? null : hoursToSeconds(parsed);
    if (seconds === (task.estimate ?? null)) return;

    try {
      await saveEstimate({ taskId, projectId, estimate: seconds });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("tasks:tree.estimateError"),
      );
    }
  };

  const detach = async () => {
    try {
      await reparent({
        taskId,
        parentId: null,
        projectId,
        previousParentId: task.parentId ?? null,
      });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("tasks:tree.reparentError"),
      );
    }
  };

  return (
    <section className="flex flex-col gap-2 rounded-md border border-border/60 p-3">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
          <ListTree className="size-4" />
          {t("tasks:tree.title")}
        </h2>
        {task.parentId && canEdit && (
          <Button
            variant="ghost"
            size="xs"
            className="text-muted-foreground"
            onClick={detach}
            disabled={isReparenting}
          >
            <ChevronUp className="size-3.5" />
            {t("tasks:tree.detach")}
          </Button>
        )}
      </div>

      {hasBranch && subtree && (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
          <dt className="text-muted-foreground">
            {t("tasks:tree.branchProgress")}
          </dt>
          <dd className="text-right font-medium tabular-nums">
            {subtree.descendantDoneCount}/{subtree.descendantCount} (
            {subtree.progress}%)
          </dd>

          {(subtree.inheritsStartDate || subtree.inheritsDueDate) && (
            <>
              <dt className="flex items-center gap-1 text-muted-foreground">
                <CalendarRange className="size-3" />
                {t("tasks:tree.branchDates")}
              </dt>
              <dd className="text-right tabular-nums">
                {subtree.startDate
                  ? format(new Date(subtree.startDate), "d MMM")
                  : "—"}
                {" → "}
                {subtree.dueDate
                  ? format(new Date(subtree.dueDate), "d MMM")
                  : "—"}
              </dd>
            </>
          )}

          <dt className="flex items-center gap-1 text-muted-foreground">
            <Timer className="size-3" />
            {t("tasks:tree.branchTime")}
          </dt>
          <dd className="text-right tabular-nums">
            {formatDuration(subtree.loggedSeconds, i18n.language)}
            {subtree.estimateSeconds > 0 && (
              <>
                {" / "}
                {formatDuration(subtree.estimateSeconds, i18n.language)}
              </>
            )}
          </dd>
        </dl>
      )}

      <div className="flex items-center justify-between gap-2 text-xs">
        <label className="text-muted-foreground" htmlFor="task-estimate">
          {t("tasks:tree.estimateLabel")}
        </label>
        <span className="flex items-center gap-1">
          <Input
            id="task-estimate"
            size="sm"
            inputMode="decimal"
            className="w-20 text-right"
            value={estimateInput}
            disabled={!canEdit}
            placeholder="—"
            onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
              setEstimateInput(event.target.value)
            }
            onBlur={commitEstimate}
            onKeyDown={(event: React.KeyboardEvent<HTMLInputElement>) => {
              if (event.key === "Enter") event.currentTarget.blur();
            }}
          />
          <span className="text-muted-foreground">
            {t("tasks:tree.hoursShort")}
          </span>
        </span>
      </div>
    </section>
  );
}
