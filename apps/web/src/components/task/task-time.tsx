import { format } from "date-fns";
import { CalendarDays, Plus, Timer, X } from "lucide-react";
import { type FormEvent, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useTaskPlanMutations } from "@/hooks/mutations/planner/use-task-plan-mutations";
import useCreateTimeEntry from "@/hooks/mutations/time-entry/use-create-time-entry";
import { usePlanEntry } from "@/hooks/queries/planner/use-plan-entry";
import useGetTimeEntriesByTaskId from "@/hooks/queries/time-entry/use-get-time-entries";
import { useElapsed } from "@/hooks/use-elapsed";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { formatDuration, parseDurationInput } from "@/lib/duration";
import { formatDate } from "@/lib/format";
import { toast } from "@/lib/toast";

type TaskTimeProps = {
  taskId: string;
  workspaceId: string;
  estimate: number | null;
};

/** `yyyy-mm-dd` del servidor → la medianoche local de ese dia. */
function dayFromKey(key: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

/** La hora de inicio por defecto: hace media hora, redondeada a 5 minutos. */
function defaultStart(): string {
  const date = new Date(Date.now() - 30 * 60_000);
  date.setMinutes(Math.floor(date.getMinutes() / 5) * 5);
  return format(date, "HH:mm");
}

/**
 * El tiempo de **esta** tarea en su detalle (sub-bloque 0.3 del interludio):
 * en que dia la tiene quien mira en su plan, lo registrado frente a lo
 * estimado, quien lo registro y cuando, y un registro manual.
 *
 * Hasta ahora lo registrado solo se veia en una tarea con hijas -el agregado
 * de la rama de `TaskTree`-, el plan personal solo desde el Planificador, y
 * no habia forma de apuntar a mano "ayer le dedique una hora": los hooks
 * existian sin que nada los usara. El cronometro va en la cabecera del
 * detalle, no aqui.
 */
export default function TaskTime({
  taskId,
  workspaceId,
  estimate,
}: TaskTimeProps) {
  const { t, i18n } = useTranslation();
  const { canUpdateTasks } = useWorkspacePermission();
  const canEdit = canUpdateTasks();
  const { data: planData } = usePlanEntry(workspaceId, taskId);
  const {
    plan,
    unplan,
    isPending: isPlanning,
  } = useTaskPlanMutations(workspaceId, taskId);
  const { data: entries = [] } = useGetTimeEntriesByTaskId(taskId);
  const createEntry = useCreateTimeEntry();

  const [planOpen, setPlanOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [day, setDay] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [start, setStart] = useState(defaultStart);
  const [duration, setDuration] = useState("30m");
  const fieldId = useId();

  const plannedDay = planData?.entry?.plannedDay ?? null;
  const running = entries.find((entry) => !entry.endTime);
  const runningSeconds = useElapsed(running?.startTime);
  const loggedSeconds =
    entries.reduce(
      (sum, entry) => sum + (entry.endTime ? (entry.duration ?? 0) : 0),
      0,
    ) + runningSeconds;

  function choosePlanDay(date: Date | undefined) {
    if (!date) return;
    plan(format(date, "yyyy-MM-dd"), {
      onError: () => toast.error(t("tasks:time.planError")),
    });
    setPlanOpen(false);
  }

  function removeFromPlan() {
    unplan(undefined, {
      onError: () => toast.error(t("tasks:time.planError")),
    });
    setPlanOpen(false);
  }

  function openForm() {
    setDay(format(new Date(), "yyyy-MM-dd"));
    setStart(defaultStart());
    setDuration("30m");
    setAdding(true);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const seconds = parseDurationInput(duration);
    // `new Date("yyyy-mm-ddTHH:mm")` sin zona se lee en hora local: es la
    // hora que quien registra tiene delante.
    const startTime = new Date(`${day}T${start}`);
    if (!seconds || Number.isNaN(startTime.getTime())) {
      toast.error(t("tasks:time.invalidDuration"));
      return;
    }

    createEntry.mutate(
      {
        taskId,
        startTime: startTime.toISOString(),
        endTime: new Date(startTime.getTime() + seconds * 1000).toISOString(),
      },
      {
        onSuccess: () => {
          toast.success(t("tasks:time.added"));
          setAdding(false);
        },
        onError: () => toast.error(t("tasks:time.addError")),
      },
    );
  }

  return (
    <section className="flex flex-col gap-2 rounded-md border border-border/60 p-3">
      <h2 className="flex items-center gap-1.5 text-section">
        <Timer className="size-4" />
        {t("tasks:time.title")}
      </h2>

      <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-1.5 text-xs">
        <dt className="text-muted-foreground">{t("tasks:time.plan")}</dt>
        <dd className="flex items-center justify-end gap-1">
          <Popover open={planOpen} onOpenChange={setPlanOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="xs"
                className="gap-1.5 tabular-nums"
                disabled={isPlanning}
              >
                <CalendarDays className="size-3" />
                {plannedDay
                  ? formatDate(dayFromKey(plannedDay), {
                      weekday: "short",
                      day: "numeric",
                      month: "short",
                    })
                  : t("tasks:time.unplanned")}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="p-0" align="end">
              <Calendar
                mode="single"
                selected={plannedDay ? dayFromKey(plannedDay) : undefined}
                onSelect={choosePlanDay}
                className="w-full bg-popover"
              />
              {plannedDay && (
                <div className="border-t border-border pt-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start gap-2 text-muted-foreground hover:text-foreground"
                    onClick={removeFromPlan}
                  >
                    <X className="size-4" />
                    {t("tasks:time.unplan")}
                  </Button>
                </div>
              )}
            </PopoverContent>
          </Popover>
        </dd>

        <dt className="text-muted-foreground">{t("tasks:time.logged")}</dt>
        <dd className="text-right tabular-nums" data-testid="task-time-logged">
          {formatDuration(loggedSeconds, i18n.language)}
          {estimate != null && estimate > 0 && (
            <span className="text-muted-foreground">
              {" / "}
              {formatDuration(estimate, i18n.language)}
            </span>
          )}
        </dd>
      </dl>

      {entries.length > 0 ? (
        <ul className="flex flex-col gap-0.5 text-xs">
          {[...entries].reverse().map((entry) => (
            <li
              key={entry.id}
              className="flex items-center gap-2 rounded px-1 py-0.5 hover:bg-accent/50"
            >
              <span className="min-w-0 flex-1 truncate">
                {entry.userName ?? "—"}
              </span>
              <span className="shrink-0 text-muted-foreground tabular-nums">
                {formatDate(entry.startTime, {
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
              <span className="w-16 shrink-0 text-right tabular-nums">
                {entry.endTime
                  ? formatDuration(entry.duration ?? 0, i18n.language)
                  : t("tasks:time.running")}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">
          {t("tasks:time.noEntries")}
        </p>
      )}

      {canEdit &&
        (adding ? (
          <form
            onSubmit={submit}
            className="flex flex-wrap items-end gap-2 border-t border-border/60 pt-2 text-xs"
          >
            <div className="flex flex-col gap-1">
              <label
                htmlFor={`${fieldId}-date`}
                className="text-muted-foreground"
              >
                {t("tasks:time.date")}
              </label>
              <Input
                id={`${fieldId}-date`}
                type="date"
                size="sm"
                value={day}
                onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                  setDay(event.target.value)
                }
                required
              />
            </div>
            <div className="flex flex-col gap-1">
              <label
                htmlFor={`${fieldId}-start`}
                className="text-muted-foreground"
              >
                {t("tasks:time.start")}
              </label>
              <Input
                id={`${fieldId}-start`}
                type="time"
                size="sm"
                value={start}
                onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                  setStart(event.target.value)
                }
                required
              />
            </div>
            <div className="flex flex-col gap-1">
              <label
                htmlFor={`${fieldId}-duration`}
                className="text-muted-foreground"
              >
                {t("tasks:time.duration")}
              </label>
              <Input
                id={`${fieldId}-duration`}
                size="sm"
                inputMode="text"
                className="w-24"
                value={duration}
                placeholder={t("tasks:time.durationPlaceholder")}
                onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                  setDuration(event.target.value)
                }
                required
              />
            </div>
            <div className="ml-auto flex gap-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setAdding(false)}
              >
                {t("common:actions.cancel")}
              </Button>
              <Button type="submit" size="sm" disabled={createEntry.isPending}>
                {t("common:actions.save")}
              </Button>
            </div>
          </form>
        ) : (
          <Button
            variant="ghost"
            size="xs"
            className="w-fit gap-1.5 text-muted-foreground"
            onClick={openForm}
          >
            <Plus className="size-3" />
            {t("tasks:time.add")}
          </Button>
        ))}
    </section>
  );
}
