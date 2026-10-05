import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  CalendarCheck,
  CalendarDays,
  CalendarMinus,
  CalendarPlus,
  CheckSquare,
  Clock,
  Crosshair,
  Ellipsis,
  Play,
  Square,
  Star,
  Timer,
  Undo2,
} from "lucide-react";
import { type ReactNode, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { StopDialog } from "@/components/timer/stop-dialog";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Menu,
  MenuCheckboxItem,
  MenuItem,
  MenuPopup,
  MenuSeparator,
  MenuSub,
  MenuSubPopup,
  MenuSubTrigger,
  MenuTrigger,
} from "@/components/ui/menu";
import { useTaskPlanMutations } from "@/hooks/mutations/planner/use-task-plan-mutations";
import { useCompleteTask } from "@/hooks/mutations/task/use-complete-task";
import { useUpdateTaskEstimate } from "@/hooks/mutations/task/use-update-task-estimate";
import { useTimerMutations } from "@/hooks/mutations/time-entry/use-timer-mutations";
import { usePlanEntry } from "@/hooks/queries/planner/use-plan-entry";
import { useRunningTimer } from "@/hooks/queries/time-entry/use-running-timer";
import useActiveWorkspace from "@/hooks/queries/workspace/use-active-workspace";
import { useElapsed } from "@/hooks/use-elapsed";
import { useStopWithConfirm } from "@/hooks/use-stop-with-confirm";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { dayKey, parseDayKey } from "@/lib/day-key";
import { parseDurationInput, secondsToHours } from "@/lib/duration";
import { HttpError } from "@/lib/http-error";
import { fromMinutes, toMinutes } from "@/lib/minutes";
import { toast } from "@/lib/toast";

export type RowActionTask = {
  id: string;
  number: number | null;
  title: string;
  projectId: string;
  estimate: number | null;
  isDone: boolean;
};

export type RowActionPlan = {
  /** `yyyy-mm-dd`. */
  plannedDay: string;
  startMinute: number | null;
  keyRank: number | null;
};

type TaskRowActionsProps = {
  /** Ausente: el espacio activo, para filas que no lo reciben. */
  workspaceId?: string;
  task: RowActionTask;
  /**
   * Donde esta en el plan de quien mira. `null`: sin planificar. Ausente: no
   * se sabe -Mis tareas no lo lee-, y se pregunta al abrir el menu.
   */
  plan?: RowActionPlan | null;
  /** Recibe el boton «⋯» y pinta la fila; la fila entera abre el contextual. */
  children: (menuButton: ReactNode) => ReactNode;
};

function localDayKey(offset: number) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return dayKey(date);
}

function stopPropagation(event: { stopPropagation: () => void }) {
  event.stopPropagation();
}

/**
 * El menu de acciones de una fila de tarea (ADR 053), el mismo en Hoy, el
 * Planificador, el Cronograma y Mis tareas: hecha, cronometro, hoy, mañana,
 * elegir dia, fijar hora, quitar del plan, estimar e imprescindible. Sale con
 * el boton «⋯» y con el clic derecho (o pulsacion larga) sobre la fila.
 *
 * Los dos menus pintan las mismas piezas: en base-ui el contextual es un menu
 * con otro disparador, asi que `MenuItem` sirve en los dos. La hora y la
 * estimacion piden un dato y van en un dialogo aparte; un campo de texto
 * dentro de un menu pelea con su navegacion por teclado.
 */
export function TaskRowActions({
  workspaceId: workspaceIdProp,
  task,
  plan,
  children,
}: TaskRowActionsProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: activeWorkspace } = useActiveWorkspace();
  const workspaceId = workspaceIdProp ?? activeWorkspace?.id ?? "";
  const queryClient = useQueryClient();
  const { canUpdateTasks } = useWorkspacePermission();
  // Uno por menu: compartir el estado abria el desplegable a la vez que el
  // contextual.
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const menuOpen = dropdownOpen || contextOpen;
  const [dialog, setDialog] = useState<"time" | "estimate" | null>(null);

  const lookup = usePlanEntry(
    workspaceId,
    plan === undefined && menuOpen ? task.id : "",
  );
  const resolvedPlan: RowActionPlan | null =
    plan !== undefined
      ? plan
      : lookup.data?.entry
        ? {
            plannedDay: lookup.data.entry.plannedDay,
            startMinute: lookup.data.entry.startMinute,
            keyRank: lookup.data.entry.keyRank,
          }
        : null;

  const planMutations = useTaskPlanMutations(workspaceId, task.id);
  const completeTask = useCompleteTask(workspaceId);
  const { mutate: updateEstimate } = useUpdateTaskEstimate();
  const { data: timer } = useRunningTimer(workspaceId);
  const { start, stop: stopTimer, isStopping } = useTimerMutations(workspaceId);
  const isRunningThis = timer?.running?.task?.id === task.id;
  const elapsed = useElapsed(
    isRunningThis ? timer?.running?.startTime : undefined,
  );
  const stopFlow = useStopWithConfirm(stopTimer, elapsed);

  const canEdit = canUpdateTasks();
  const today = localDayKey(0);
  const tomorrow = localDayKey(1);
  const plannedDay = resolvedPlan?.plannedDay ?? null;

  const onError = (error: unknown) => {
    toast.error(
      error instanceof HttpError && error.status === 409
        ? t("taskActions:keyFull")
        : t("taskActions:error"),
    );
  };

  const planOn = (day: string) => planMutations.plan(day, { onError });

  const saveEstimate = (seconds: number | null) =>
    updateEstimate(
      { taskId: task.id, projectId: task.projectId, estimate: seconds },
      {
        onSuccess: () => {
          for (const queryKey of [
            ["today"],
            ["planner"],
            ["schedule"],
            ["my-work"],
          ]) {
            queryClient.invalidateQueries({ queryKey });
          }
        },
        onError,
      },
    );

  const items = (
    <>
      {canEdit && (
        <MenuItem
          onClick={() =>
            completeTask.mutate({ taskId: task.id, done: !task.isDone })
          }
        >
          {task.isDone ? <Undo2 /> : <CheckSquare />}
          {t(task.isDone ? "taskActions:reopen" : "taskActions:markDone")}
        </MenuItem>
      )}
      {(isRunningThis || (canEdit && !task.isDone)) && (
        <MenuItem
          onClick={() =>
            isRunningThis
              ? stopFlow.requestStop()
              : start({
                  id: task.id,
                  number: task.number,
                  title: task.title,
                  projectId: task.projectId,
                  estimate: task.estimate,
                })
          }
        >
          {isRunningThis ? <Square /> : <Play />}
          {t(isRunningThis ? "timer:stop" : "timer:start")}
        </MenuItem>
      )}
      {canEdit && !task.isDone && (
        <MenuItem
          onClick={() =>
            navigate({
              to: "/dashboard/workspace/$workspaceId/focus/$taskId",
              params: { workspaceId, taskId: task.id },
            })
          }
        >
          <Crosshair />
          {t("focus:menuItem")}
        </MenuItem>
      )}

      <MenuSeparator />

      {plannedDay !== today && (
        <MenuItem onClick={() => planOn(today)}>
          <CalendarCheck />
          {t("taskActions:planToday")}
        </MenuItem>
      )}
      {plannedDay !== tomorrow && (
        <MenuItem onClick={() => planOn(tomorrow)}>
          <CalendarPlus />
          {t("taskActions:planTomorrow")}
        </MenuItem>
      )}
      <MenuSub>
        <MenuSubTrigger>
          <CalendarDays />
          {t("taskActions:pickDay")}
        </MenuSubTrigger>
        <MenuSubPopup className="w-fit min-w-0 p-0">
          <div className="p-2">
            <Calendar
              mode="single"
              selected={plannedDay ? parseDayKey(plannedDay) : undefined}
              onSelect={(date) => {
                if (!date) return;
                setDropdownOpen(false);
                setContextOpen(false);
                planOn(dayKey(date));
              }}
            />
          </div>
        </MenuSubPopup>
      </MenuSub>
      {resolvedPlan && (
        <>
          <MenuItem onClick={() => setDialog("time")}>
            <Clock />
            {t("taskActions:setTime")}
          </MenuItem>
          <MenuItem
            onClick={() => planMutations.unplan(undefined, { onError })}
          >
            <CalendarMinus />
            {t("taskActions:unplan")}
          </MenuItem>
        </>
      )}

      <MenuSeparator />

      {canEdit && (
        <MenuItem onClick={() => setDialog("estimate")}>
          <Timer />
          {t("taskActions:estimate")}
        </MenuItem>
      )}
      {resolvedPlan && (
        <MenuCheckboxItem
          checked={resolvedPlan.keyRank !== null}
          onCheckedChange={(checked) =>
            planMutations.setKey(checked, { onError })
          }
          closeOnClick
        >
          <span className="flex items-center gap-2">
            <Star className="size-4 text-muted-foreground" />
            {t("taskActions:key")}
          </span>
        </MenuCheckboxItem>
      )}
    </>
  );

  const menuButton = (
    // biome-ignore lint/a11y/noStaticElementInteractions: solo corta la propagacion hacia la fila; el control es el boton de dentro
    <span
      className="inline-flex shrink-0"
      onClick={stopPropagation}
      onPointerDown={stopPropagation}
      onKeyDown={stopPropagation}
    >
      <Menu open={dropdownOpen} onOpenChange={setDropdownOpen}>
        <MenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-xs"
              className="text-muted-foreground opacity-0 transition-opacity duration-(--motion-fast) focus-visible:opacity-100 group-hover:opacity-100 data-popup-open:opacity-100 touch:opacity-100"
              aria-label={t("taskActions:menuLabel")}
            />
          }
        >
          <Ellipsis className="size-4" />
        </MenuTrigger>
        <MenuPopup align="end" className="min-w-52">
          {items}
        </MenuPopup>
      </Menu>
    </span>
  );

  return (
    <>
      <ContextMenu open={contextOpen} onOpenChange={setContextOpen}>
        <ContextMenuTrigger className="contents">
          {children(menuButton)}
        </ContextMenuTrigger>
        <ContextMenuContent className="min-w-52">{items}</ContextMenuContent>
      </ContextMenu>

      {/* Los dialogos van en un portal, pero sus eventos suben por el arbol de
          React hasta la fila: sin cortarlos, guardar abriria la tarea. */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: solo corta la propagacion */}
      <span
        className="contents"
        onClick={stopPropagation}
        onKeyDown={stopPropagation}
      >
        {dialog === "time" && resolvedPlan && (
          <TimeDialog
            title={task.title}
            minute={resolvedPlan.startMinute}
            onClose={() => setDialog(null)}
            onSave={(startMinute) =>
              planMutations.anchor(
                { plannedDate: resolvedPlan.plannedDay, startMinute },
                { onError },
              )
            }
          />
        )}
        {dialog === "estimate" && (
          <EstimateDialog
            title={task.title}
            estimate={task.estimate}
            onClose={() => setDialog(null)}
            onSave={saveEstimate}
          />
        )}
        {isRunningThis && (
          <StopDialog
            open={stopFlow.dialogOpen}
            onClose={stopFlow.closeDialog}
            onConfirm={stopFlow.confirmStop}
            isPending={isStopping}
          />
        )}
      </span>
    </>
  );
}

/** La hora a la que se ancla en su dia, o quitarla. */
function TimeDialog({
  title,
  minute,
  onSave,
  onClose,
}: {
  title: string;
  minute: number | null;
  onSave: (minute: number | null) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const inputId = useId();
  const [draft, setDraft] = useState(() => fromMinutes(minute ?? 9 * 60));

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {t("taskActions:timeDialog.title", { title })}
          </DialogTitle>
        </DialogHeader>
        <DialogPanel scrollFade={false} className="space-y-1.5">
          <Label htmlFor={inputId}>{t("taskActions:timeDialog.label")}</Label>
          <Input
            id={inputId}
            type="time"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
        </DialogPanel>
        <DialogFooter>
          {minute !== null && (
            <Button
              variant="outline"
              onClick={() => {
                onSave(null);
                onClose();
              }}
            >
              {t("taskActions:timeDialog.remove")}
            </Button>
          )}
          <Button
            disabled={!draft}
            onClick={() => {
              onSave(toMinutes(draft));
              onClose();
            }}
          >
            {t("common:actions.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** La estimacion con la misma sintaxis que el resto: `1h 30m`, `1,5`… */
function EstimateDialog({
  title,
  estimate,
  onSave,
  onClose,
}: {
  title: string;
  estimate: number | null;
  onSave: (seconds: number | null) => void;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const inputId = useId();
  const [draft, setDraft] = useState(() =>
    estimate ? secondsToHours(estimate).toLocaleString(i18n.language) : "",
  );
  const [invalid, setInvalid] = useState(false);

  const save = () => {
    const seconds = parseDurationInput(draft);
    if (seconds === undefined) {
      setInvalid(true);
      return;
    }
    onSave(seconds);
    onClose();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {t("taskActions:estimateDialog.title", { title })}
          </DialogTitle>
        </DialogHeader>
        <DialogPanel scrollFade={false} className="space-y-1.5">
          <Label htmlFor={inputId}>
            {t("taskActions:estimateDialog.label")}
          </Label>
          <Input
            id={inputId}
            value={draft}
            placeholder="1h 30m"
            aria-invalid={invalid || undefined}
            onChange={(event) => {
              setDraft(event.target.value);
              setInvalid(false);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") save();
            }}
          />
          <p className="text-meta text-muted-foreground">
            {invalid
              ? t("taskActions:estimateDialog.invalid")
              : t("taskActions:estimateDialog.hint")}
          </p>
        </DialogPanel>
        <DialogFooter>
          <Button onClick={save}>{t("common:actions.save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Donde esta una entrada del plan, para `TaskRowActions`. */
export function rowPlanOf(entry: {
  plannedDate: string;
  startMinute: number | null;
  keyRank: number | null;
}): RowActionPlan {
  return {
    plannedDay: dayKey(new Date(entry.plannedDate)),
    startMinute: entry.startMinute,
    keyRank: entry.keyRank,
  };
}
