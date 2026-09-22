import { createFileRoute } from "@tanstack/react-router";
import { Clock } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import WorkspaceLayout from "@/components/common/workspace-layout";
import PageTitle from "@/components/page-title";
import { CreateBlockDialog } from "@/components/schedule/create-block-dialog";
import {
  formatClock,
  hourMarks,
  minutesToPx,
} from "@/components/schedule/schedule-timeline";
import { ScheduleSegmentCard } from "@/components/schedule/segment-card";
import TaskDetailsSheet from "@/components/task/task-details-sheet";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import type { ScheduleDay, ScheduleSegment } from "@/fetchers/schedule";
import { useScheduleMutations } from "@/hooks/mutations/schedule/use-schedule-mutations";
import { useSchedule } from "@/hooks/queries/schedule/use-schedule";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/format";

const WINDOW_DAYS = 7;

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/workspace/$workspaceId/schedule",
)({
  component: RouteComponent,
});

/**
 * El Cronograma (ADR 041): la ventana de `personal_plan_entry` por horas, no
 * por dias como el Planificador. Los limites de la rejilla se calculan sobre
 * lo que de verdad hay que mostrar -jornada 08:00-18:00 mas cualquier bloque
 * fijo que se salga de ahi- en vez de fijar siempre 24 h, que dejaria vacio
 * casi todo el dia en el caso comun.
 */
function RouteComponent() {
  const { t } = useTranslation();
  const { workspaceId } = Route.useParams();
  const { data, isPending } = useSchedule(workspaceId, WINDOW_DAYS);
  const mutations = useScheduleMutations(workspaceId, WINDOW_DAYS);

  const [openTask, setOpenTask] = useState<{
    taskId: string;
    projectId: string;
  } | null>(null);
  const [blockDialogDay, setBlockDialogDay] = useState<string | null>(null);

  const workStartMinute = data?.workStartMinute ?? 8 * 60;
  const workEndMinute = data?.workEndMinute ?? 18 * 60;

  const [gridStart, gridEnd] = useMemo(() => {
    let min = workStartMinute;
    let max = workEndMinute;
    for (const day of data?.days ?? []) {
      for (const segment of day.segments) {
        min = Math.min(min, segment.startSecond / 60);
        max = Math.max(max, segment.endSecond / 60);
      }
    }
    return [Math.floor(min / 60) * 60, Math.ceil(max / 60) * 60];
  }, [data, workStartMinute, workEndMinute]);

  const gridHeightPx = minutesToPx(gridEnd - gridStart);

  const isEmpty =
    !isPending &&
    (data?.days.every(
      (day) =>
        day.segments.length === 0 &&
        day.overflow.length === 0 &&
        day.ghosts.length === 0,
    ) ??
      true);

  return (
    <>
      <PageTitle title={t("schedule:pageTitle")} />
      <WorkspaceLayout title={t("schedule:pageTitle")}>
        {isPending ? (
          <div className="flex gap-3 p-4">
            {["a", "b", "c"].map((key) => (
              <Skeleton key={key} className="h-96 w-44 shrink-0 rounded-lg" />
            ))}
          </div>
        ) : isEmpty ? (
          <Empty className="min-h-[50vh]">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Clock />
              </EmptyMedia>
              <EmptyTitle>{t("schedule:empty.title")}</EmptyTitle>
              <EmptyDescription>
                {t("schedule:empty.description")}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="min-h-0 flex-1 overflow-auto p-4">
            <div className="flex" style={{ minHeight: gridHeightPx + 40 }}>
              <div className="sticky top-0 left-0 z-20 w-12 shrink-0 bg-background">
                <div className="h-10" />
                <div className="relative" style={{ height: gridHeightPx }}>
                  {hourMarks(gridStart, gridEnd).map((mark) => (
                    <div
                      key={mark}
                      className="absolute right-1 -translate-y-1/2 text-meta text-muted-foreground"
                      style={{ top: minutesToPx(mark - gridStart) }}
                    >
                      {formatClock(mark)}
                    </div>
                  ))}
                </div>
              </div>
              {(data?.days ?? []).map((day) => (
                <DayColumn
                  key={day.dayDate}
                  day={day}
                  gridStart={gridStart}
                  gridEnd={gridEnd}
                  workStartMinute={workStartMinute}
                  workEndMinute={workEndMinute}
                  onOpen={(segment) => {
                    if (segment.type === "block" || !segment.task) return;
                    setOpenTask({
                      taskId: segment.task.id,
                      projectId: segment.task.projectId,
                    });
                  }}
                  onMove={(taskId, minute) =>
                    mutations.setEntryTime.mutate({
                      taskId,
                      startMinute: minute,
                    })
                  }
                  onUnpin={(taskId) =>
                    mutations.setEntryTime.mutate({
                      taskId,
                      startMinute: null,
                    })
                  }
                  onAddBlock={() => setBlockDialogDay(day.dayDate)}
                />
              ))}
            </div>
          </div>
        )}
      </WorkspaceLayout>

      <TaskDetailsSheet
        taskId={openTask?.taskId}
        projectId={openTask?.projectId ?? ""}
        workspaceId={workspaceId}
        onClose={() => setOpenTask(null)}
      />

      <CreateBlockDialog
        open={blockDialogDay !== null}
        day={blockDialogDay ?? ""}
        onClose={() => setBlockDialogDay(null)}
        isPending={mutations.createBlock.isPending}
        onCreate={(input) => {
          mutations.createBlock.mutate(input);
          setBlockDialogDay(null);
        }}
      />
    </>
  );
}

function DayColumn({
  day,
  gridStart,
  gridEnd,
  workStartMinute,
  workEndMinute,
  onOpen,
  onMove,
  onUnpin,
  onAddBlock,
}: {
  day: ScheduleDay;
  gridStart: number;
  gridEnd: number;
  workStartMinute: number;
  workEndMinute: number;
  onOpen: (segment: ScheduleSegment) => void;
  onMove: (taskId: string, minute: number) => void;
  onUnpin: (taskId: string) => void;
  onAddBlock: () => void;
}) {
  const { t } = useTranslation();
  const date = new Date(`${day.dayDate}T00:00:00`);
  const gridHeightPx = minutesToPx(gridEnd - gridStart);
  const nowMinute = new Date().getHours() * 60 + new Date().getMinutes();

  const loadSeconds = day.segments
    .filter((segment) => segment.type === "flow" || segment.type === "pinned")
    .reduce(
      (total, segment) => total + (segment.endSecond - segment.startSecond),
      0,
    );
  const loadPct = Math.round(
    (loadSeconds / ((workEndMinute - workStartMinute) * 60)) * 100,
  );

  return (
    <div
      data-testid={`schedule-column-${day.dayDate}`}
      className="w-44 shrink-0 border-border/60 border-l"
    >
      <div className="sticky top-0 z-10 h-10 space-y-1 bg-background px-2 py-1">
        <div className="flex items-center justify-between">
          <h2 className="truncate text-section">
            {day.isToday
              ? `${t("schedule:today")} · ${formatDate(date, { weekday: "short", day: "numeric" })}`
              : formatDate(date, { weekday: "short", day: "numeric" })}
          </h2>
          <button
            type="button"
            onClick={onAddBlock}
            aria-label={t("schedule:createBlock.title")}
            className="rounded px-1 text-meta text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            +
          </button>
        </div>
        <div className="h-1 overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              "h-full rounded-full",
              loadPct > 100 ? "bg-warning-foreground" : "bg-brand",
            )}
            style={{ width: `${Math.min(loadPct, 100)}%` }}
          />
        </div>
      </div>

      <div className="relative" style={{ height: gridHeightPx }}>
        <div
          className="absolute inset-x-0 bg-muted/30"
          style={{
            top: minutesToPx(workStartMinute - gridStart),
            height: minutesToPx(workEndMinute - workStartMinute),
          }}
        />
        {hourMarks(gridStart, gridEnd).map((mark) => (
          <div
            key={mark}
            className="absolute inset-x-0 border-border/40 border-t"
            style={{ top: minutesToPx(mark - gridStart) }}
          />
        ))}
        {day.isToday && nowMinute >= gridStart && nowMinute <= gridEnd && (
          <div
            className="absolute inset-x-0 z-10 border-t-2 border-destructive"
            style={{ top: minutesToPx(nowMinute - gridStart) }}
          />
        )}

        {day.segments.map((segment) => {
          if (segment.type === "block") {
            const primary = segment.entries[0];
            return (
              <div
                key={`${segment.startSecond}-${segment.endSecond}`}
                className={cn(
                  "absolute inset-x-1 overflow-hidden rounded-md border border-dashed p-1 text-meta",
                  primary?.kind === "running"
                    ? "border-destructive/50 bg-destructive/10"
                    : primary?.kind === "break"
                      ? "border-border/70 bg-muted/60"
                      : "border-border/70 bg-muted/40",
                )}
                style={{
                  top: minutesToPx(segment.startSecond / 60 - gridStart),
                  height: Math.max(
                    minutesToPx((segment.endSecond - segment.startSecond) / 60),
                    16,
                  ),
                }}
              >
                <span className="truncate">
                  {segment.entries
                    .filter((entry) => entry.kind !== "running")
                    .map((entry) => entry.title)
                    .join(" / ") || t("schedule:running")}
                </span>
              </div>
            );
          }

          if (!segment.task) return null;

          return (
            <ScheduleSegmentCard
              key={`${segment.taskId}-${segment.startSecond}`}
              task={segment.task}
              startMinute={segment.startSecond / 60}
              durationMinutes={(segment.endSecond - segment.startSecond) / 60}
              isPinned={segment.type === "pinned"}
              conflict={segment.type === "pinned" && segment.conflict}
              truncated={segment.type === "flow" && segment.truncated}
              gridStart={gridStart}
              minMinute={gridStart}
              maxMinute={gridEnd}
              onOpen={() => onOpen(segment)}
              onMove={(minute) => onMove(segment.taskId, minute)}
              onUnpin={
                segment.type === "pinned"
                  ? () => onUnpin(segment.taskId)
                  : undefined
              }
            />
          );
        })}
      </div>

      {day.overflow.length > 0 && (
        <div className="space-y-1 border-t px-2 py-1.5">
          <p className="text-meta text-muted-foreground">
            {t("schedule:overflow")}
          </p>
          {day.overflow.map((entry) =>
            entry.task ? (
              <button
                key={entry.taskId}
                type="button"
                onClick={() =>
                  onOpen({
                    type: "flow",
                    taskId: entry.taskId,
                    startSecond: 0,
                    endSecond: 0,
                    part: 0,
                    truncated: false,
                    task: entry.task,
                  })
                }
                className="block w-full truncate rounded px-1 py-0.5 text-left text-meta hover:bg-muted"
              >
                {entry.task.title}
              </button>
            ) : null,
          )}
        </div>
      )}

      {day.ghosts.length > 0 && (
        <div className="space-y-1 border-t px-2 py-1.5 opacity-70">
          {day.ghosts.map((ghost) => (
            <div
              key={`${ghost.recurrenceId}-${ghost.plannedDate}`}
              className="truncate rounded border border-dashed px-1 py-0.5 text-meta"
            >
              {ghost.title}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
