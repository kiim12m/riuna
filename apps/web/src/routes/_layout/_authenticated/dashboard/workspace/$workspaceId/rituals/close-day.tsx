import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import WorkspaceLayout from "@/components/common/workspace-layout";
import PageTitle from "@/components/page-title";
import { RatingStep } from "@/components/rituals/rating-step";
import {
  RitualShell,
  type RitualStep,
} from "@/components/rituals/ritual-shell";
import { parseDayKey } from "@/components/schedule/schedule-range";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import type { TodayEntry } from "@/fetchers/today";
import { useCloseDay } from "@/hooks/mutations/review/use-close-day";
import { usePlanner } from "@/hooks/queries/planner/use-planner";
import { useDayReview } from "@/hooks/queries/review/use-day-review";
import { useToday } from "@/hooks/queries/today/use-today";
import { useWorkSchedule } from "@/hooks/queries/work-schedule/use-work-schedule";
import { cn } from "@/lib/cn";
import { formatDuration } from "@/lib/duration";
import { formatDate } from "@/lib/format";
import { toast } from "@/lib/toast";
import { nextWorkDayKey } from "@/lib/work-days";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/workspace/$workspaceId/rituals/close-day",
)({
  component: CloseDayRoute,
});

/** Lunes a viernes, los valores por defecto de la jornada (ADR 045). */
const DEFAULT_WORK_DAYS = 0b0_111_110;

function dayKeyOf(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function dayLabel(key: string) {
  return formatDate(parseDayKey(key), {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

/**
 * «Terminar el dia» (ADR 054): resumen, una decision por cada pendiente,
 * bloqueos, valoracion privada y lo siguiente. Nada se guarda hasta el
 * ultimo paso, que lo manda todo junto a `PUT /review/day/:date`.
 */
function CloseDayRoute() {
  const { t, i18n } = useTranslation();
  const { workspaceId } = Route.useParams();
  const navigate = useNavigate();
  const { data: today, isPending } = useToday(workspaceId);
  const { data: schedule } = useWorkSchedule();
  const { data: plan } = usePlanner(workspaceId);
  const date = today?.serverToday ?? "";
  const { data: saved } = useDayReview(workspaceId, date);
  const { mutate: closeDay, isPending: isClosing } = useCloseDay(
    workspaceId,
    date,
  );

  const [decisions, setDecisions] = useState<Record<string, string | null>>({});
  const [blockers, setBlockers] = useState("");
  const [impact, setImpact] = useState<number | null>(null);
  const [energy, setEnergy] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [prefilled, setPrefilled] = useState(false);

  // Cerrar otra vez el mismo dia parte de lo que ya se guardo.
  useEffect(() => {
    if (prefilled || !saved) return;
    setBlockers(saved.review?.blockers ?? "");
    setImpact(saved.private?.impact ?? null);
    setEnergy(saved.private?.energy ?? null);
    setNote(saved.private?.note ?? "");
    setPrefilled(true);
  }, [saved, prefilled]);

  const pending: TodayEntry[] = useMemo(
    () => [...(today?.previous ?? []), ...(today?.planned ?? [])],
    [today],
  );
  const nextDay = date
    ? nextWorkDayKey(date, schedule?.workDays ?? DEFAULT_WORK_DAYS)
    : "";
  const undecided = pending.filter((task) => !(task.id in decisions));

  const exit = () =>
    navigate({
      to: "/dashboard/workspace/$workspaceId/today",
      params: { workspaceId },
    });

  const finish = () =>
    closeDay(
      {
        decisions: pending.map((task) => ({
          taskId: task.id,
          plannedDate: decisions[task.id] ?? null,
        })),
        blockers: blockers.trim() || null,
        impact,
        energy,
        note: note.trim() || null,
      },
      {
        onSuccess: () => {
          toast.success(t("rituals:closeDay.done"));
          exit();
        },
        onError: () => toast.error(t("rituals:closeDay.error")),
      },
    );

  const next = useMemo(() => {
    if (!nextDay) return [];
    const already = (plan?.entries ?? []).filter(
      (entry) => dayKeyOf(new Date(entry.plannedDate)) === nextDay,
    );
    const ids = new Set(already.map((entry) => entry.id));
    const moving = pending.filter(
      (task) => decisions[task.id] === nextDay && !ids.has(task.id),
    );
    return [...already, ...moving].map((task) => ({
      id: task.id,
      title: task.title,
    }));
  }, [plan, pending, decisions, nextDay]);

  if (isPending || !today) {
    return (
      <WorkspaceLayout title={t("rituals:closeDay.title")}>
        <div className="mx-auto max-w-2xl space-y-2 p-4">
          <Skeleton className="h-8 w-1/2" />
          <Skeleton className="h-32 w-full" />
        </div>
      </WorkspaceLayout>
    );
  }

  const steps: RitualStep[] = [
    {
      id: "summary",
      title: t("rituals:closeDay.summary.title"),
      content: (
        <div className="space-y-2">
          <p className="text-body">
            {today.done.length > 0
              ? t("rituals:closeDay.summary.done", {
                  count: today.done.length,
                })
              : t("rituals:closeDay.summary.nothingDone")}{" "}
            {t("rituals:closeDay.summary.worked", {
              time: formatDuration(today.totals.workedToday, i18n.language),
            })}
          </p>
          {today.done.length > 0 && (
            <ul className="space-y-0.5 text-body">
              {today.done.map((task) => (
                <li key={task.id} className="truncate text-muted-foreground">
                  ✓ {task.title}
                </li>
              ))}
            </ul>
          )}
        </div>
      ),
    },
    {
      id: "pending",
      title: t("rituals:closeDay.pending.title"),
      hint: t("rituals:closeDay.pending.hint"),
      canContinue: undecided.length === 0,
      blockedReason: t("rituals:closeDay.pending.undecided", {
        count: undecided.length,
      }),
      content:
        pending.length === 0 ? (
          <p className="text-body text-muted-foreground">
            {t("rituals:closeDay.pending.none")}
          </p>
        ) : (
          <div className="space-y-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setDecisions(
                  Object.fromEntries(pending.map((task) => [task.id, nextDay])),
                )
              }
            >
              {t("rituals:closeDay.pending.allTo", { day: dayLabel(nextDay) })}
            </Button>
            <ul className="space-y-1">
              {pending.map((task) => (
                <PendingRow
                  key={task.id}
                  title={task.title}
                  today={date}
                  nextDay={nextDay}
                  value={decisions[task.id]}
                  onChange={(value) =>
                    setDecisions((current) => ({
                      ...current,
                      [task.id]: value,
                    }))
                  }
                />
              ))}
            </ul>
          </div>
        ),
    },
    {
      id: "blockers",
      title: t("rituals:closeDay.blockers.title"),
      hint: t("rituals:closeDay.blockers.hint"),
      content: (
        <Textarea
          aria-label={t("rituals:closeDay.blockers.title")}
          value={blockers}
          placeholder={t("rituals:closeDay.blockers.placeholder")}
          onChange={(event) => setBlockers(event.target.value)}
          maxLength={2000}
        />
      ),
    },
    {
      id: "rating",
      title: t("rituals:closeDay.rating.title"),
      hint: t("rituals:closeDay.rating.hint"),
      content: (
        <RatingStep
          impact={impact}
          energy={energy}
          note={note}
          onImpact={setImpact}
          onEnergy={setEnergy}
          onNote={setNote}
        />
      ),
    },
    {
      id: "next",
      title: t("rituals:closeDay.next.title", { day: dayLabel(nextDay) }),
      hint: t("rituals:closeDay.next.hint"),
      content:
        next.length === 0 ? (
          <p className="text-body text-muted-foreground">
            {t("rituals:closeDay.next.empty")}
          </p>
        ) : (
          <ul className="space-y-0.5 text-body">
            {next.map((task) => (
              <li key={task.id} className="truncate">
                {task.title}
              </li>
            ))}
          </ul>
        ),
    },
  ];

  return (
    <>
      <PageTitle title={t("rituals:closeDay.title")} />
      <WorkspaceLayout title={t("rituals:closeDay.title")}>
        <RitualShell
          title={t("rituals:closeDay.title")}
          steps={steps}
          finishLabel={t("rituals:closeDay.finish")}
          onFinish={finish}
          isFinishing={isClosing}
          onExit={exit}
        />
      </WorkspaceLayout>
    </>
  );
}

/** Una pendiente: al siguiente dia laborable, a otro o fuera del plan. */
function PendingRow({
  title,
  today,
  nextDay,
  value,
  onChange,
}: {
  title: string;
  today: string;
  nextDay: string;
  /** `undefined`: sin decidir. `null`: fuera del plan. */
  value: string | null | undefined;
  onChange: (value: string | null) => void;
}) {
  const { t } = useTranslation();
  const [pickerOpen, setPickerOpen] = useState(false);
  const otherDay = value && value !== nextDay ? value : null;

  const option = (selected: boolean) =>
    cn(selected && "border-brand bg-brand/10 text-foreground");

  return (
    <li
      className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/70 px-2.5 py-2"
      data-testid="close-day-pending"
    >
      <span className="min-w-0 flex-1 truncate text-body">{title}</span>
      <div className="flex flex-wrap gap-1">
        <Button
          variant="outline"
          size="xs"
          aria-pressed={value === nextDay}
          className={option(value === nextDay)}
          onClick={() => onChange(nextDay)}
        >
          {dayLabel(nextDay)}
        </Button>
        <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="xs"
              aria-pressed={Boolean(otherDay)}
              className={option(Boolean(otherDay))}
            >
              {otherDay
                ? dayLabel(otherDay)
                : t("rituals:closeDay.pending.otherDay")}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-fit p-2" align="end">
            <Calendar
              mode="single"
              selected={otherDay ? parseDayKey(otherDay) : undefined}
              disabled={(date) => dayKeyOf(date) <= today}
              onSelect={(date) => {
                if (!date) return;
                onChange(dayKeyOf(date));
                setPickerOpen(false);
              }}
            />
          </PopoverContent>
        </Popover>
        <Button
          variant="outline"
          size="xs"
          aria-pressed={value === null}
          className={option(value === null)}
          onClick={() => onChange(null)}
        >
          {t("rituals:closeDay.pending.unplan")}
        </Button>
      </div>
    </li>
  );
}
