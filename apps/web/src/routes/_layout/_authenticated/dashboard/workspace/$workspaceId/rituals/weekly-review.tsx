import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import WorkspaceLayout from "@/components/common/workspace-layout";
import PageTitle from "@/components/page-title";
import { DayLoadBar } from "@/components/planner/day-load-bar";
import { RatingStep } from "@/components/rituals/rating-step";
import {
  RitualShell,
  type RitualStep,
} from "@/components/rituals/ritual-shell";
import { RitualTaskRow } from "@/components/rituals/ritual-task-row";
import TaskMovePopover from "@/components/task/task-move-popover";
import { TaskRowActions } from "@/components/task-actions/task-row-actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useCloseWeek } from "@/hooks/mutations/review/use-close-week";
import { useInbox } from "@/hooks/queries/capture/use-inbox";
import { useMyTasksSearch } from "@/hooks/queries/my-work/use-search-my-work";
import { useWaiting } from "@/hooks/queries/my-work/use-waiting";
import { usePlanner } from "@/hooks/queries/planner/use-planner";
import { useWeekReview } from "@/hooks/queries/review/use-week-review";
import { useGetTasks } from "@/hooks/queries/task/use-get-tasks";
import { dayKey, parseDayKey } from "@/lib/day-key";
import { formatDuration } from "@/lib/duration";
import { formatDate } from "@/lib/format";
import { toast } from "@/lib/toast";
import { useUserPreferencesStore } from "@/store/user-preferences";
import type Task from "@/types/task";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/workspace/$workspaceId/rituals/weekly-review",
)({
  component: WeeklyReviewRoute,
});

const SHOWN = 15;

function addDays(key: string, days: number) {
  const date = parseDayKey(key);
  date.setDate(date.getDate() + days);
  return dayKey(date);
}

/**
 * El primer dia de la semana que se revisa, con la preferencia de comienzo
 * de semana de la persona. Los dos primeros dias de una semana se revisa la
 * anterior, que es la que acaba de cerrarse; despues, la que esta en curso.
 */
function defaultWeekStart(weekStartsOn: number) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const sinceStart = (today.getDay() - weekStartsOn + 7) % 7;
  today.setDate(today.getDate() - sinceStart - (sinceStart < 2 ? 7 : 0));
  return dayKey(today);
}

function weekLabel(start: string) {
  const end = parseDayKey(addDays(start, 6));
  const options = { day: "numeric", month: "short" } as const;
  return `${formatDate(parseDayKey(start), options)} – ${formatDate(end, options)}`;
}

/**
 * La revision semanal (sub-bloque 2.3): vaciar la Bandeja, repasar lo
 * vencido y lo que espera a otros, mirar la semana con sus cifras, preparar
 * la siguiente y, al final, bloqueos y valoracion -privada, como la del dia
 * (ADR 054)-. Como en «Planificar el dia», cada accion se guarda al momento;
 * el ultimo paso guarda la revision.
 */
function WeeklyReviewRoute() {
  const { t, i18n } = useTranslation();
  const { workspaceId } = Route.useParams();
  const navigate = useNavigate();
  const weekStartsOn = useUserPreferencesStore((state) => state.weekStartsOn);
  const [start, setStart] = useState(() => defaultWeekStart(weekStartsOn));
  const nextStart = addDays(start, 7);

  const { data: review, isPending } = useWeekReview(workspaceId, start);
  const { data: inbox } = useInbox(workspaceId);
  const { data: inboxBoard } = useGetTasks(inbox?.id ?? "");
  const { data: mine } = useMyTasksSearch({
    workspaceId,
    scope: "assigned",
    sortBy: "smart",
    limit: 100,
  });
  const { data: waiting } = useWaiting(workspaceId);
  const { data: nextWeek } = usePlanner(workspaceId, 7, nextStart);
  const { mutate: closeWeek, isPending: isClosing } = useCloseWeek(
    workspaceId,
    start,
  );

  const [blockers, setBlockers] = useState("");
  const [impact, setImpact] = useState<number | null>(null);
  const [energy, setEnergy] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [prefilledFor, setPrefilledFor] = useState<string | null>(null);
  const blockersId = useId();

  useEffect(() => {
    if (!review || prefilledFor === start) return;
    setBlockers(review.review?.blockers ?? "");
    setImpact(review.private?.impact ?? null);
    setEnergy(review.private?.energy ?? null);
    setNote(review.private?.note ?? "");
    setPrefilledFor(start);
  }, [review, start, prefilledFor]);

  const inboxTasks: Task[] = useMemo(
    () =>
      (inboxBoard?.columns ?? [])
        .filter((column) => !column.isFinal)
        .flatMap((column) => column.tasks),
    [inboxBoard],
  );
  const overdue = (mine?.tasks ?? []).filter(
    (task) => task.dueWindow === "overdue",
  );

  const exit = () =>
    navigate({
      to: "/dashboard/workspace/$workspaceId/today",
      params: { workspaceId },
    });

  if (isPending || !review) {
    return (
      <WorkspaceLayout title={t("rituals:weeklyReview.title")}>
        <div className="mx-auto max-w-2xl space-y-2 p-4">
          <Skeleton className="h-8 w-1/2" />
          <Skeleton className="h-32 w-full" />
        </div>
      </WorkspaceLayout>
    );
  }

  const { stats } = review;
  const accuracy =
    stats.estimatedSeconds > 0
      ? Math.round(
          ((stats.loggedOnEstimatedSeconds - stats.estimatedSeconds) /
            stats.estimatedSeconds) *
            100,
        )
      : null;

  const finish = () =>
    closeWeek(
      {
        blockers: blockers.trim() || null,
        impact,
        energy,
        note: note.trim() || null,
      },
      {
        onSuccess: () => {
          toast.success(t("rituals:weeklyReview.done"));
          exit();
        },
        onError: () => toast.error(t("rituals:weeklyReview.error")),
      },
    );

  const steps: RitualStep[] = [
    {
      id: "inbox",
      title: t("rituals:weeklyReview.inbox.title"),
      hint: t("rituals:weeklyReview.inbox.hint"),
      content:
        inboxTasks.length === 0 ? (
          <Empty text={t("rituals:weeklyReview.inbox.none")} />
        ) : (
          <div className="space-y-1">
            {inboxTasks.slice(0, SHOWN).map((task) => (
              <TaskRowActions
                key={task.id}
                workspaceId={workspaceId}
                task={{
                  id: task.id,
                  number: task.number,
                  title: task.title,
                  projectId: task.projectId,
                  estimate: task.estimate ?? null,
                  isDone: false,
                }}
              >
                {(menu) => (
                  <RitualTaskRow
                    testId="weekly-inbox"
                    title={task.title}
                    priority={task.priority ?? undefined}
                    projectName={inbox?.name ?? ""}
                    projectIcon={inbox?.icon ?? null}
                    trailing={
                      <>
                        <TaskMovePopover
                          task={task}
                          workspaceId={workspaceId}
                          // Avisa `useMoveTask`; esto solo evita salir del ritual.
                          onMoved={() => undefined}
                        />
                        {menu}
                      </>
                    }
                  />
                )}
              </TaskRowActions>
            ))}
            <More count={inboxTasks.length - SHOWN} />
          </div>
        ),
    },
    {
      id: "overdue",
      title: t("rituals:weeklyReview.overdue.title"),
      hint: t("rituals:weeklyReview.overdue.hint"),
      content:
        overdue.length === 0 ? (
          <Empty text={t("rituals:weeklyReview.overdue.none")} />
        ) : (
          <div className="space-y-1">
            {overdue.slice(0, SHOWN).map((task) => (
              <TaskRowActions
                key={task.id}
                workspaceId={workspaceId}
                task={{
                  id: task.id,
                  number: task.number,
                  title: task.title,
                  projectId: task.projectId,
                  estimate: task.estimate,
                  isDone: task.isDone,
                }}
              >
                {(menu) => (
                  <RitualTaskRow
                    testId="weekly-overdue"
                    title={task.title}
                    priority={task.priority}
                    projectName={task.projectName}
                    projectIcon={task.projectIcon}
                    trailing={menu}
                  />
                )}
              </TaskRowActions>
            ))}
            <More count={overdue.length - SHOWN} />
          </div>
        ),
    },
    {
      id: "waiting",
      title: t("rituals:weeklyReview.waiting.title"),
      hint: t("rituals:weeklyReview.waiting.hint"),
      content:
        (waiting?.delegated.length ?? 0) + (waiting?.blocked.length ?? 0) ===
        0 ? (
          <Empty text={t("myTasks:waiting.empty.title")} />
        ) : (
          <div className="space-y-1">
            {waiting?.delegated.slice(0, SHOWN).map((task) => (
              <RitualTaskRow
                key={task.id}
                title={task.title}
                priority={task.priority}
                projectName={task.projectName}
                projectIcon={task.projectIcon}
                trailing={
                  <span className="text-meta text-muted-foreground">
                    {t("myTasks:waiting.waitingOn", {
                      names: task.assignees
                        .map((assignee) => assignee.name)
                        .join(", "),
                    })}
                  </span>
                }
              />
            ))}
            {waiting?.blocked.slice(0, SHOWN).map((task) => (
              <RitualTaskRow
                key={task.id}
                title={task.title}
                priority={task.priority}
                projectName={task.projectName}
                projectIcon={task.projectIcon}
                trailing={
                  <span className="text-meta text-muted-foreground">
                    {t("myTasks:waiting.blockedBy", {
                      tasks: task.blockedBy
                        .map((blocker) => blocker.title)
                        .join(", "),
                    })}
                  </span>
                }
              />
            ))}
          </div>
        ),
    },
    {
      id: "week",
      title: t("rituals:weeklyReview.week.title", { range: weekLabel(start) }),
      content: (
        <div className="space-y-3">
          <SegmentedControl
            label={t("rituals:weeklyReview.week.which")}
            value={start}
            onValueChange={setStart}
            options={[
              {
                value: defaultWeekStart(weekStartsOn),
                label: weekLabel(defaultWeekStart(weekStartsOn)),
              },
              {
                value: addDays(defaultWeekStart(weekStartsOn), -7),
                label: weekLabel(addDays(defaultWeekStart(weekStartsOn), -7)),
              },
            ]}
          />
          <dl className="grid grid-cols-3 gap-3" data-testid="weekly-stats">
            <Figure
              label={t("rituals:weeklyReview.week.done")}
              value={String(stats.done)}
            />
            <Figure
              label={t("rituals:weeklyReview.week.worked")}
              value={formatDuration(stats.workedSeconds, i18n.language)}
            />
            <Figure
              label={t("rituals:weeklyReview.week.accuracy")}
              value={
                accuracy === null
                  ? "—"
                  : accuracy === 0
                    ? t("rituals:weeklyReview.week.onTarget")
                    : t(
                        accuracy > 0
                          ? "rituals:weeklyReview.week.over"
                          : "rituals:weeklyReview.week.under",
                        { pct: Math.abs(accuracy) },
                      )
              }
            />
          </dl>
        </div>
      ),
    },
    {
      id: "next",
      title: t("rituals:weeklyReview.next.title", {
        range: weekLabel(nextStart),
      }),
      hint: t("rituals:weeklyReview.next.hint"),
      content: (
        <div className="space-y-3">
          <div className="space-y-1.5" data-testid="weekly-next-load">
            {Array.from({ length: 7 }, (_, offset) =>
              addDays(nextStart, offset),
            )
              .filter((day) => (nextWeek?.capacityByDay?.[day] ?? 0) > 0)
              .map((day) => {
                const load = nextWeek?.loadByDay?.[day];
                return (
                  <div
                    key={day}
                    className="grid grid-cols-[6rem_1fr_7rem] items-center gap-2 text-meta"
                  >
                    <span>
                      {formatDate(parseDayKey(day), {
                        weekday: "short",
                        day: "numeric",
                      })}
                    </span>
                    <DayLoadBar pct={load?.pct ?? 0} />
                    <span className="text-right text-muted-foreground tabular-nums">
                      {formatDuration(load?.loadSeconds ?? 0, i18n.language)} /{" "}
                      {formatDuration(
                        load?.capacitySeconds ?? 0,
                        i18n.language,
                      )}
                    </span>
                  </div>
                );
              })}
          </div>
          {(nextWeek?.unplanned.length ?? 0) > 0 && (
            <div className="space-y-1">
              <p className="text-meta text-muted-foreground">
                {t("rituals:weeklyReview.next.unplanned", {
                  count: nextWeek?.unplanned.length ?? 0,
                })}
              </p>
              {nextWeek?.unplanned.slice(0, SHOWN).map((task) => (
                <TaskRowActions
                  key={task.id}
                  workspaceId={workspaceId}
                  task={{
                    id: task.id,
                    number: task.number,
                    title: task.title,
                    projectId: task.projectId,
                    estimate: task.estimate,
                    isDone: task.isDone,
                  }}
                  plan={null}
                >
                  {(menu) => (
                    <RitualTaskRow
                      title={task.title}
                      priority={task.priority}
                      projectName={task.projectName}
                      projectIcon={task.projectIcon}
                      trailing={menu}
                    />
                  )}
                </TaskRowActions>
              ))}
            </div>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              navigate({
                to: "/dashboard/workspace/$workspaceId/planner",
                params: { workspaceId },
                search: { from: nextStart },
              })
            }
          >
            {t("rituals:weeklyReview.next.openPlanner")}
          </Button>
        </div>
      ),
    },
    {
      id: "rating",
      title: t("rituals:weeklyReview.rating.title"),
      hint: t("rituals:closeDay.rating.hint"),
      content: (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor={blockersId}>
              {t("rituals:closeDay.blockers.title")}
            </Label>
            <Textarea
              id={blockersId}
              value={blockers}
              placeholder={t("rituals:closeDay.blockers.placeholder")}
              onChange={(event) => setBlockers(event.target.value)}
              maxLength={2000}
            />
            <p className="text-meta text-muted-foreground">
              {t("rituals:closeDay.blockers.hint")}
            </p>
          </div>
          <RatingStep
            impact={impact}
            energy={energy}
            note={note}
            onImpact={setImpact}
            onEnergy={setEnergy}
            onNote={setNote}
          />
        </div>
      ),
    },
  ];

  return (
    <>
      <PageTitle title={t("rituals:weeklyReview.title")} />
      <WorkspaceLayout title={t("rituals:weeklyReview.title")}>
        <RitualShell
          title={t("rituals:weeklyReview.title")}
          steps={steps}
          finishLabel={t("rituals:weeklyReview.finish")}
          onFinish={finish}
          isFinishing={isClosing}
          onExit={exit}
        />
      </WorkspaceLayout>
    </>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="text-body text-muted-foreground">{text}</p>;
}

function More({ count }: { count: number }) {
  const { t } = useTranslation();
  if (count <= 0) return null;
  return (
    <p className="text-meta text-muted-foreground">
      {t("rituals:weeklyReview.more", { count })}
    </p>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border/70 p-3">
      <dt className="text-meta text-muted-foreground">{label}</dt>
      <dd className="text-section tabular-nums">{value}</dd>
    </div>
  );
}
