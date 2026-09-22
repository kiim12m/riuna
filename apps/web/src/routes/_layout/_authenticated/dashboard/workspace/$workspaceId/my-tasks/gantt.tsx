import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  addDays,
  endOfWeek,
  parseISO,
  startOfDay,
  startOfWeek,
  subDays,
} from "date-fns";
import { CalendarDays, Layout } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import WorkspaceLayout from "@/components/common/workspace-layout";
import {
  GanttTaskBar,
  type ScheduledTask,
} from "@/components/gantt/gantt-task-bar";
import {
  buildHeaderBands,
  buildTimeline,
  isZoomLevel,
  ZOOM_LEVELS,
  type ZoomLevel,
} from "@/components/gantt/gantt-timeline";
import PageTitle from "@/components/page-title";
import { PersonalTasksTabs } from "@/components/personal-tasks/tabs";
import TaskDetailsSheet from "@/components/task/task-details-sheet";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { SegmentedControl } from "@/components/ui/segmented-control";
import projectIcons from "@/constants/project-icons";
import type { MyWorkTask, PersonalScope } from "@/fetchers/my-work";
import { useMyTasksSearch } from "@/hooks/queries/my-work/use-search-my-work";
import { useUserPreferencesStore } from "@/store/user-preferences";

type GanttSearchParams = {
  taskId?: string;
  scope?: PersonalScope;
  zoom?: ZoomLevel;
};

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/workspace/$workspaceId/my-tasks/gantt",
)({
  component: RouteComponent,
  validateSearch: (search: Record<string, unknown>): GanttSearchParams => ({
    taskId: typeof search.taskId === "string" ? search.taskId : undefined,
    scope: search.scope === "team" ? "team" : undefined,
    zoom: isZoomLevel(search.zoom) ? search.zoom : undefined,
  }),
});

const ZOOM_LABEL_KEY: Record<ZoomLevel, string> = {
  day: "tasks:gantt.zoomDay",
  week: "tasks:gantt.zoomWeek",
  month: "tasks:gantt.zoomMonth",
  quarter: "tasks:gantt.zoomQuarter",
};

function parseTaskDate(value: string | null | undefined) {
  if (!value) return null;
  const parsed = parseISO(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

type ScheduledMyWorkTask = ScheduledTask & MyWorkTask;

/**
 * "Mis tareas" › Gantt: de solo lectura (`GanttTaskBar readOnly`), sin capa
 * de dependencias —`task_relation` es de un proyecto— y sin jerarquia: cada
 * tarea es su propia fila, ordenadas por fecha de inicio (ADR 039). "Hecha"
 * sale de `isDone`, que `searchTasks` ya resuelve igual en todas partes desde
 * la ADR 030, en vez de las columnas finales de un proyecto que aqui no hay
 * una sola.
 */
function RouteComponent() {
  const { t } = useTranslation();
  const { workspaceId } = Route.useParams();
  const { taskId, scope = "assigned", zoom: zoomParam } = Route.useSearch();
  const navigate = useNavigate();

  const { data } = useMyTasksSearch({ workspaceId, scope, sortBy: "smart" });
  const weekStartsOn = useUserPreferencesStore((state) => state.weekStartsOn);
  const zoom: ZoomLevel = zoomParam ?? "day";
  const today = useMemo(() => startOfDay(new Date()), []);

  const scrollRef = useRef<HTMLDivElement>(null);
  const railWidthRem = "16rem";

  const setZoom = (next: ZoomLevel) => {
    navigate({
      to: ".",
      search: (previous: GanttSearchParams) => ({
        ...previous,
        zoom: next === "day" ? undefined : next,
      }),
      replace: true,
    });
  };

  const parsedTasks = useMemo<ScheduledMyWorkTask[]>(() => {
    return (data?.tasks ?? [])
      .map((task): ScheduledMyWorkTask | null => {
        const parsedStart =
          parseTaskDate(task.startDate) ?? parseTaskDate(task.dueDate);
        const parsedEnd =
          parseTaskDate(task.dueDate) ?? parseTaskDate(task.startDate);
        if (!parsedStart || !parsedEnd) return null;
        const start = parsedStart <= parsedEnd ? parsedStart : parsedEnd;
        const end = parsedEnd >= parsedStart ? parsedEnd : parsedStart;
        return {
          ...task,
          parentId: null,
          position: 0,
          description: null,
          assigneeId: task.userId,
          assigneeName:
            task.assignees.find((a) => a.id === task.userId)?.name ?? null,
          scheduleStart: startOfDay(start),
          scheduleEnd: startOfDay(end),
        };
      })
      .filter((task): task is ScheduledMyWorkTask => task !== null)
      .sort((a, b) => a.scheduleStart.getTime() - b.scheduleStart.getTime());
  }, [data]);

  const bounds = useMemo(() => {
    if (parsedTasks.length === 0) return null;
    let earliest = parsedTasks[0].scheduleStart;
    let latest = parsedTasks[0].scheduleEnd;
    for (const task of parsedTasks) {
      if (task.scheduleStart < earliest) earliest = task.scheduleStart;
      if (task.scheduleEnd > latest) latest = task.scheduleEnd;
    }
    const weekStart = startOfWeek(earliest, { weekStartsOn });
    const weekEnd = endOfWeek(latest, { weekStartsOn });
    return {
      rangeStart: startOfDay(subDays(weekStart, 7)),
      rangeEnd: startOfDay(addDays(weekEnd, 28)),
    };
  }, [parsedTasks, weekStartsOn]);

  const timeline = useMemo(
    () =>
      bounds ? buildTimeline(bounds.rangeStart, bounds.rangeEnd, zoom) : null,
    [bounds, zoom],
  );

  const headerBands = useMemo(
    () =>
      timeline
        ? buildHeaderBands(timeline, zoom, weekStartsOn, today, t)
        : null,
    [timeline, zoom, weekStartsOn, today, t],
  );

  const todaySegment =
    headerBands?.bottom.find((segment) => segment.isCurrent) ?? null;

  // biome-ignore lint/correctness/useExhaustiveDependencies: se centra al aparecer/cambiar de zoom
  useEffect(() => {
    if (!todaySegment) return;
    const scroller = scrollRef.current;
    const marker = scroller?.querySelector<HTMLElement>("[data-gantt-today]");
    if (!scroller || !marker) return;
    scroller.scrollLeft = Math.max(
      0,
      marker.offsetLeft + marker.offsetWidth / 2 - scroller.clientWidth / 2,
    );
  }, [zoom, timeline?.trackWidthPx, todaySegment]);

  const openTask = (id: string) => {
    navigate({
      to: ".",
      search: (previous: GanttSearchParams) => ({ ...previous, taskId: id }),
      replace: true,
    });
  };

  const hasSchedule = timeline != null && parsedTasks.length > 0;
  const openTaskDetail = parsedTasks.find((task) => task.id === taskId);

  return (
    <>
      <PageTitle title={t("myTasks:pageTitle")} />
      <WorkspaceLayout
        title={t("myTasks:pageTitle")}
        headerActions={
          <PersonalTasksTabs
            workspaceId={workspaceId}
            active="gantt"
            scope={scope}
            onScopeChange={(next) =>
              navigate({
                to: ".",
                search: (previous: GanttSearchParams) => ({
                  ...previous,
                  scope: next === "assigned" ? undefined : next,
                }),
                replace: true,
              })
            }
          />
        }
      >
        <div className="flex h-full min-h-0 flex-col bg-background">
          <div className="border-border/80 border-b px-3 py-2.5 sm:px-4">
            <SegmentedControl
              label={t("tasks:gantt.zoomLabel")}
              value={zoom}
              onValueChange={setZoom}
              options={ZOOM_LEVELS.map((level) => ({
                value: level,
                label: t(ZOOM_LABEL_KEY[level]),
              }))}
            />
          </div>

          {!hasSchedule ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <CalendarDays />
                </EmptyMedia>
                <EmptyTitle>{t("tasks:gantt.noTasks")}</EmptyTitle>
                <EmptyDescription>
                  {t("tasks:gantt.noTasksSubtitle")}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            timeline &&
            headerBands && (
              <div
                ref={scrollRef}
                className="min-h-0 flex-1 overflow-auto overscroll-x-contain [-webkit-overflow-scrolling:touch]"
              >
                <div className="relative w-max min-w-full">
                  <div className="sticky top-0 z-40 flex border-border border-b bg-background/92 backdrop-blur">
                    <div
                      className="sticky left-0 z-50 flex shrink-0 items-end border-border border-r bg-background px-3 pb-1"
                      style={{ width: railWidthRem }}
                    >
                      <span className="text-label font-medium uppercase tracking-[0.06em] text-muted-foreground">
                        {t("tasks:gantt.taskHeader")}
                      </span>
                    </div>
                    <div
                      className="relative shrink-0"
                      style={{ width: `${timeline.trackWidthPx}px` }}
                    >
                      <div className="relative h-[1.1rem] border-border/60 border-b">
                        {headerBands.top.map((segment) => (
                          <div
                            key={segment.key}
                            className="absolute inset-y-0 flex items-center truncate pl-1 text-label uppercase tracking-[0.06em] text-muted-foreground"
                            style={{
                              left: segment.leftPx,
                              width: segment.widthPx,
                            }}
                          >
                            {segment.label}
                          </div>
                        ))}
                      </div>
                      <div className="relative h-[1.45rem]">
                        {headerBands.bottom.map((segment) => (
                          <div
                            key={segment.key}
                            aria-current={
                              segment.isCurrent ? "date" : undefined
                            }
                            className={
                              segment.isCurrent
                                ? "absolute inset-y-0 flex items-center justify-center overflow-hidden border-border/50 border-l bg-brand/10 text-label font-semibold text-brand-strong"
                                : "absolute inset-y-0 flex items-center justify-center overflow-hidden border-border/50 border-l text-label text-muted-foreground"
                            }
                            style={{
                              left: segment.leftPx,
                              width: segment.widthPx,
                            }}
                          >
                            {segment.label}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="relative">
                    {todaySegment && (
                      <div
                        aria-hidden="true"
                        data-gantt-today
                        className="pointer-events-none absolute inset-y-0 z-0 bg-brand/8"
                        style={{
                          left: `calc(${railWidthRem} + ${todaySegment.leftPx}px)`,
                          width: `${todaySegment.widthPx}px`,
                        }}
                      />
                    )}

                    <div className="flex flex-col">
                      {parsedTasks.map((task) => {
                        const ProjectIcon =
                          projectIcons[
                            task.projectIcon as keyof typeof projectIcons
                          ] ?? Layout;

                        return (
                          <div
                            key={task.id}
                            className="group/row flex items-stretch border-border/40 border-b transition-colors hover:bg-accent/25"
                            style={{
                              height: "calc(var(--density-row) - 0.3rem)",
                            }}
                          >
                            <div
                              className="sticky left-0 z-30 shrink-0 border-border border-r bg-background"
                              style={{ width: railWidthRem }}
                            >
                              <button
                                type="button"
                                onClick={() => openTask(task.id)}
                                className="flex h-full w-full items-center gap-2 px-2 text-left outline-none transition-colors group-hover/row:bg-accent/25 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                              >
                                <ProjectIcon className="size-3 shrink-0 text-muted-foreground" />
                                <span className="min-w-0 flex-1 truncate font-medium text-foreground text-xs">
                                  {task.title}
                                </span>
                              </button>
                            </div>

                            <div
                              className="relative shrink-0"
                              style={{ width: `${timeline.trackWidthPx}px` }}
                            >
                              <GanttTaskBar
                                task={task}
                                depth={0}
                                isDone={task.isDone}
                                timeline={timeline}
                                readOnly
                                onOpenTask={() => openTask(task.id)}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            )
          )}
        </div>
      </WorkspaceLayout>

      <TaskDetailsSheet
        taskId={taskId}
        projectId={openTaskDetail?.projectId ?? ""}
        workspaceId={workspaceId}
        onClose={() =>
          navigate({
            to: ".",
            search: (previous: GanttSearchParams) => ({
              ...previous,
              taskId: undefined,
            }),
            replace: true,
          })
        }
      />
    </>
  );
}
