import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Star } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import WorkspaceLayout from "@/components/common/workspace-layout";
import PageTitle from "@/components/page-title";
import { DayLoadBar } from "@/components/planner/day-load-bar";
import {
  RitualShell,
  type RitualStep,
} from "@/components/rituals/ritual-shell";
import { RitualTaskRow } from "@/components/rituals/ritual-task-row";
import { InlineEstimate } from "@/components/timer/inline-estimate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { usePlanBulk } from "@/hooks/mutations/planner/use-plan-bulk";
import { useTaskPlanMutations } from "@/hooks/mutations/planner/use-task-plan-mutations";
import { useTimerMutations } from "@/hooks/mutations/time-entry/use-timer-mutations";
import { useTodayEstimateMutation } from "@/hooks/mutations/today/use-today-estimate-mutation";
import { usePlanner } from "@/hooks/queries/planner/use-planner";
import { useToday } from "@/hooks/queries/today/use-today";
import { cn } from "@/lib/cn";
import { formatDuration } from "@/lib/duration";
import { HttpError } from "@/lib/http-error";
import { fromMinutes, toMinutes } from "@/lib/minutes";
import { toast } from "@/lib/toast";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/workspace/$workspaceId/rituals/plan-day",
)({
  component: PlanDayRoute,
});

/** Lo que se enseña de «sin planificar» en un paso: el resto, en el Planificador. */
const UNPLANNED_SHOWN = 15;
const MAX_KEY = 3;

/**
 * «Planificar el dia» (sub-bloque 2.2): pura composicion sobre lo que ya
 * existe, sin API propia. Lo de ayer, lo urgente, la Bandeja y lo sin
 * planificar, las imprescindibles, la carga frente a la capacidad y las horas
 * ancladas; «Empezar» arranca el cronometro en la primera imprescindible. Cada
 * accion se guarda al momento, como en Hoy: los pasos siguientes ya la ven.
 */
function PlanDayRoute() {
  const { t, i18n } = useTranslation();
  const { workspaceId } = Route.useParams();
  const navigate = useNavigate();
  const { data: today, isPending } = useToday(workspaceId);
  const { data: plan } = usePlanner(workspaceId);
  const planBulk = usePlanBulk(workspaceId);
  const { setEstimate } = useTodayEstimateMutation(workspaceId);
  const { start } = useTimerMutations(workspaceId);

  const exit = () =>
    navigate({
      to: "/dashboard/workspace/$workspaceId/today",
      params: { workspaceId },
    });

  if (isPending || !today) {
    return (
      <WorkspaceLayout title={t("rituals:planDay.title")}>
        <div className="mx-auto max-w-2xl space-y-2 p-4">
          <Skeleton className="h-8 w-1/2" />
          <Skeleton className="h-32 w-full" />
        </div>
      </WorkspaceLayout>
    );
  }

  const date = today.serverToday;
  const planned = today.planned;
  const unplanned = plan?.unplanned ?? [];
  const keyCount = planned.filter((entry) => entry.keyRank !== null).length;
  const load = plan?.loadByDay?.[date];

  const startDay = () => {
    const first =
      planned.find((entry) => entry.keyRank !== null) ?? planned[0] ?? null;
    if (first) {
      start({
        id: first.id,
        number: first.number,
        title: first.title,
        projectId: first.projectId,
        estimate: first.estimate,
      });
    }
    exit();
  };

  const steps: RitualStep[] = [
    {
      id: "previous",
      title: t("rituals:planDay.previous.title"),
      hint: t("rituals:planDay.previous.hint"),
      content:
        today.previous.length === 0 ? (
          <Empty text={t("rituals:planDay.previous.none")} />
        ) : (
          <div className="space-y-2">
            <Button
              variant="outline"
              size="sm"
              disabled={planBulk.isPending}
              onClick={() =>
                planBulk.mutate({
                  taskIds: today.previous.map((task) => task.id),
                  plannedDate: date,
                })
              }
            >
              {t("today:previous.addAllToToday")}
            </Button>
            <div className="space-y-1">
              {today.previous.map((task) => (
                <RitualTaskRow
                  key={task.id}
                  testId="plan-day-previous"
                  title={task.title}
                  priority={task.priority}
                  projectName={task.projectName}
                  projectIcon={task.projectIcon}
                  trailing={
                    <PlanOnDay
                      workspaceId={workspaceId}
                      taskId={task.id}
                      day={date}
                      label={t("today:previous.addToToday")}
                    />
                  }
                />
              ))}
            </div>
          </div>
        ),
    },
    {
      id: "urgent",
      title: t("rituals:planDay.urgent.title"),
      hint: t("rituals:planDay.urgent.hint"),
      content:
        today.urgent.length === 0 ? (
          <Empty text={t("rituals:planDay.urgent.none")} />
        ) : (
          <div className="space-y-1">
            {today.urgent.map((task) => (
              <RitualTaskRow
                key={task.id}
                testId="plan-day-urgent"
                title={task.title}
                priority={task.priority}
                projectName={task.projectName}
                projectIcon={task.projectIcon}
                trailing={
                  <PlanOnDay
                    workspaceId={workspaceId}
                    taskId={task.id}
                    day={date}
                    label={t("today:urgent.planToday")}
                  />
                }
              />
            ))}
          </div>
        ),
    },
    {
      id: "unplanned",
      title: t("rituals:planDay.unplanned.title"),
      hint: t("rituals:planDay.unplanned.hint"),
      content:
        unplanned.length === 0 ? (
          <Empty text={t("rituals:planDay.unplanned.none")} />
        ) : (
          <div className="space-y-1">
            <div className="space-y-1">
              {unplanned.slice(0, UNPLANNED_SHOWN).map((task) => (
                <RitualTaskRow
                  key={task.id}
                  testId="plan-day-unplanned"
                  title={task.title}
                  priority={task.priority}
                  projectName={task.projectName}
                  projectIcon={task.projectIcon}
                  trailing={
                    <PlanOnDay
                      workspaceId={workspaceId}
                      taskId={task.id}
                      day={date}
                      label={t("taskActions:planToday")}
                    />
                  }
                />
              ))}
            </div>
            {unplanned.length > UNPLANNED_SHOWN && (
              <p className="text-meta text-muted-foreground">
                {t("rituals:planDay.unplanned.more", {
                  count: unplanned.length - UNPLANNED_SHOWN,
                })}
              </p>
            )}
          </div>
        ),
    },
    {
      id: "key",
      title: t("rituals:planDay.key.title"),
      hint: t("rituals:planDay.key.hint", { count: keyCount, max: MAX_KEY }),
      content:
        planned.length === 0 ? (
          <Empty text={t("rituals:planDay.empty")} />
        ) : (
          <div className="space-y-1">
            {planned.map((entry) => (
              <RitualTaskRow
                key={entry.id}
                testId="plan-day-key"
                title={entry.title}
                priority={entry.priority}
                projectName={entry.projectName}
                projectIcon={entry.projectIcon}
                leading={
                  <KeyToggle
                    workspaceId={workspaceId}
                    taskId={entry.id}
                    isKey={entry.keyRank !== null}
                  />
                }
              />
            ))}
          </div>
        ),
    },
    {
      id: "load",
      title: t("rituals:planDay.load.title"),
      hint: load
        ? t("rituals:planDay.load.hint", {
            planned: formatDuration(load.loadSeconds, i18n.language),
            available: formatDuration(load.capacitySeconds, i18n.language),
          })
        : undefined,
      content: (
        <div className="space-y-3">
          {load && (
            <div className="space-y-1">
              <DayLoadBar pct={load.pct} />
              {load.pct > 100 && (
                <p className="text-meta text-warning-foreground">
                  {t("rituals:planDay.load.over")}
                </p>
              )}
            </div>
          )}
          {planned.length === 0 ? (
            <Empty text={t("rituals:planDay.empty")} />
          ) : (
            <div className="space-y-1">
              {planned.map((entry) => (
                <RitualTaskRow
                  key={entry.id}
                  title={entry.title}
                  priority={entry.priority}
                  projectName={entry.projectName}
                  projectIcon={entry.projectIcon}
                  trailing={
                    <InlineEstimate
                      estimate={entry.estimate}
                      loggedSeconds={entry.loggedSeconds}
                      onSave={(seconds) => setEstimate(entry.id, seconds)}
                    />
                  }
                />
              ))}
            </div>
          )}
        </div>
      ),
    },
    {
      id: "anchor",
      title: t("rituals:planDay.anchor.title"),
      hint: t("rituals:planDay.anchor.hint"),
      content:
        planned.length === 0 ? (
          <Empty text={t("rituals:planDay.empty")} />
        ) : (
          <div className="space-y-1">
            {planned.map((entry) => (
              <RitualTaskRow
                key={entry.id}
                testId="plan-day-anchor"
                title={entry.title}
                priority={entry.priority}
                projectName={entry.projectName}
                projectIcon={entry.projectIcon}
                trailing={
                  <AnchorTime
                    workspaceId={workspaceId}
                    taskId={entry.id}
                    day={date}
                    title={entry.title}
                    minute={entry.startMinute}
                  />
                }
              />
            ))}
          </div>
        ),
    },
  ];

  return (
    <>
      <PageTitle title={t("rituals:planDay.title")} />
      <WorkspaceLayout title={t("rituals:planDay.title")}>
        <RitualShell
          title={t("rituals:planDay.title")}
          steps={steps}
          finishLabel={t("rituals:planDay.start")}
          onFinish={startDay}
          onExit={exit}
        />
      </WorkspaceLayout>
    </>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="text-body text-muted-foreground">{text}</p>;
}

/** Planifica una tarea para un dia: cada fila con su propia mutacion. */
function PlanOnDay({
  workspaceId,
  taskId,
  day,
  label,
}: {
  workspaceId: string;
  taskId: string;
  day: string;
  label: string;
}) {
  const { plan, isPending } = useTaskPlanMutations(workspaceId, taskId);

  return (
    <Button
      variant="outline"
      size="xs"
      disabled={isPending}
      onClick={() => plan(day)}
    >
      {label}
    </Button>
  );
}

function KeyToggle({
  workspaceId,
  taskId,
  isKey,
}: {
  workspaceId: string;
  taskId: string;
  isKey: boolean;
}) {
  const { t } = useTranslation();
  const { setKey, isPending } = useTaskPlanMutations(workspaceId, taskId);

  return (
    <Button
      variant="ghost"
      size="icon-xs"
      aria-pressed={isKey}
      aria-label={t("taskActions:key")}
      disabled={isPending}
      onClick={() =>
        setKey(!isKey, {
          onError: (error) =>
            toast.error(
              error instanceof HttpError && error.status === 409
                ? t("taskActions:keyFull")
                : t("taskActions:error"),
            ),
        })
      }
    >
      <Star
        className={cn(
          "size-4",
          isKey ? "fill-current text-warning" : "text-muted-foreground",
        )}
      />
    </Button>
  );
}

/** La hora anclada de una entrada: se guarda al salir del campo. */
function AnchorTime({
  workspaceId,
  taskId,
  day,
  title,
  minute,
}: {
  workspaceId: string;
  taskId: string;
  day: string;
  title: string;
  minute: number | null;
}) {
  const { t } = useTranslation();
  const { anchor } = useTaskPlanMutations(workspaceId, taskId);
  const [draft, setDraft] = useState(
    minute === null ? "" : fromMinutes(minute),
  );

  useEffect(() => {
    setDraft(minute === null ? "" : fromMinutes(minute));
  }, [minute]);

  const save = () => {
    const next = draft ? toMinutes(draft) : null;
    if (next === minute) return;
    anchor({ plannedDate: day, startMinute: next });
  };

  return (
    <Input
      type="time"
      size="sm"
      className="w-28"
      aria-label={t("rituals:planDay.anchor.label", { title })}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={save}
      onKeyDown={(event) => {
        if (event.key === "Enter") save();
      }}
    />
  );
}
