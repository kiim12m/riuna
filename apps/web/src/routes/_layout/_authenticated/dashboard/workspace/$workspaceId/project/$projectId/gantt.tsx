import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  addDays,
  endOfWeek,
  parseISO,
  startOfDay,
  startOfWeek,
  subDays,
} from "date-fns";
import { CalendarDays, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import ProjectLayout from "@/components/common/project-layout";
import { GanttDependencyLayer } from "@/components/gantt/gantt-dependency-layer";
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
import FilterBar from "@/components/table-view/filter-bar";
import TaskDetailsSheet from "@/components/task/task-details-sheet";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { useGetTasks } from "@/hooks/queries/task/use-get-tasks";
import useGetProjectTaskRelations from "@/hooks/queries/task-relation/use-get-project-task-relations";
import { useFilterableFields } from "@/hooks/use-filterable-fields";
import { useIsMobile } from "@/hooks/use-mobile";
import { readFilterParam, useUrlFilter } from "@/hooks/use-url-filter";
import { cn } from "@/lib/cn";
import { formatDateShort } from "@/lib/format";
import { getStatusLabel } from "@/lib/i18n/domain";
import { useUserPreferencesStore } from "@/store/user-preferences";
import type { EditableCondition } from "@/types/task-filter";

type GanttSearchParams = {
  taskId?: string;
  /** Las condiciones del filtro. Ver `useUrlFilter`. */
  filter?: EditableCondition[];
  /** Escala temporal. En la URL para que un Gantt a un zoom se pueda pegar. */
  zoom?: ZoomLevel;
};

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/workspace/$workspaceId/project/$projectId/gantt",
)({
  component: RouteComponent,
  validateSearch: (search: Record<string, unknown>): GanttSearchParams => ({
    taskId: typeof search.taskId === "string" ? search.taskId : undefined,
    filter: readFilterParam(search.filter),
    zoom: isZoomLevel(search.zoom) ? search.zoom : undefined,
  }),
});

const ZOOM_LABEL_KEY: Record<ZoomLevel, string> = {
  day: "tasks:gantt.zoomDay",
  week: "tasks:gantt.zoomWeek",
  month: "tasks:gantt.zoomMonth",
  quarter: "tasks:gantt.zoomQuarter",
};

// Franja de prioridad del riel: baja neutra, el resto por color semantico.
const PRIORITY_STRIPE: Record<string, string> = {
  low: "bg-muted-foreground/40",
  medium: "bg-info-foreground",
  high: "bg-warning-foreground",
  urgent: "bg-destructive-foreground",
};

type GanttRow = { task: ScheduledTask; depth: number };

function parseTaskDate(value: string | null | undefined) {
  if (!value) return null;
  const parsed = parseISO(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

// Orden de arbol: cada raiz por fecha, sus hijas debajo por fecha. Si el filtro
// deja fuera al padre, la hija sube a raiz (profundidad 0).
function orderTree(tasks: ScheduledTask[]): GanttRow[] {
  const visible = new Set(tasks.map((task) => task.id));
  const childrenOf = new Map<string, ScheduledTask[]>();
  for (const task of tasks) {
    const key =
      task.parentId && visible.has(task.parentId) ? task.parentId : "__root";
    const list = childrenOf.get(key);
    if (list) list.push(task);
    else childrenOf.set(key, [task]);
  }
  for (const list of childrenOf.values()) {
    list.sort((a, b) => a.scheduleStart.getTime() - b.scheduleStart.getTime());
  }
  const out: GanttRow[] = [];
  const seen = new Set<string>();
  const walk = (key: string, depth: number) => {
    for (const task of childrenOf.get(key) ?? []) {
      if (seen.has(task.id)) continue;
      seen.add(task.id);
      out.push({ task, depth });
      walk(task.id, depth + 1);
    }
  };
  walk("__root", 0);
  return out;
}

function RouteComponent() {
  const { t } = useTranslation();
  const { projectId, workspaceId } = Route.useParams();
  const { taskId, filter: filterParam, zoom: zoomParam } = Route.useSearch();
  const navigate = useNavigate();
  const { conditions, setConditions, filter } = useUrlFilter(filterParam);
  const filterableFields = useFilterableFields(projectId, workspaceId);
  const { data: project } = useGetTasks(projectId, filter);
  const { data: relations } = useGetProjectTaskRelations(projectId);
  const weekStartsOn = useUserPreferencesStore((state) => state.weekStartsOn);
  const [searchQuery, setSearchQuery] = useState("");
  const isMobile = useIsMobile();
  const [isTaskRailOpen, setIsTaskRailOpen] = useState(false);

  const zoom: ZoomLevel = zoomParam ?? "day";
  const today = useMemo(() => startOfDay(new Date()), []);

  const railWidthRem = isMobile ? "13rem" : "16rem";
  const showTaskRail = !isMobile || isTaskRailOpen;
  const railWidthCss = showTaskRail ? railWidthRem : "0rem";

  const scrollRef = useRef<HTMLDivElement>(null);
  const rowsRef = useRef<HTMLDivElement>(null);
  const [rowHeightPx, setRowHeightPx] = useState(32);

  useEffect(() => {
    setIsTaskRailOpen(!isMobile);
  }, [isMobile]);

  const setZoom = (next: ZoomLevel) => {
    navigate({
      to: ".",
      search: (previous: Record<string, unknown>) => ({
        ...previous,
        zoom: next === "day" ? undefined : next,
      }),
      replace: true,
    });
  };

  const allTasks = useMemo(
    () => [
      ...(project?.columns.flatMap((column) => column.tasks) ?? []),
      ...(project?.plannedTasks ?? []),
    ],
    [project],
  );

  const doneIds = useMemo(() => {
    const set = new Set<string>();
    for (const column of project?.columns ?? []) {
      if (column.isFinal) {
        for (const task of column.tasks) set.add(task.id);
      }
    }
    return set;
  }, [project]);

  const parsedTasks = useMemo<ScheduledTask[]>(() => {
    return allTasks
      .map((task): ScheduledTask | null => {
        const parsedStart =
          parseTaskDate(task.startDate) ?? parseTaskDate(task.dueDate);
        const parsedEnd =
          parseTaskDate(task.dueDate) ?? parseTaskDate(task.startDate);
        if (!parsedStart || !parsedEnd) return null;
        const start = parsedStart <= parsedEnd ? parsedStart : parsedEnd;
        const end = parsedEnd >= parsedStart ? parsedEnd : parsedStart;
        return {
          ...task,
          scheduleStart: startOfDay(start),
          scheduleEnd: startOfDay(end),
        };
      })
      .filter((task): task is ScheduledTask => task !== null);
  }, [allTasks]);

  const visibleTasks = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return parsedTasks;
    return parsedTasks.filter(
      (task) =>
        task.title.toLowerCase().includes(query) ||
        `${project?.slug ?? ""}-${task.number ?? ""}`
          .toLowerCase()
          .includes(query) ||
        task.status.toLowerCase().includes(query),
    );
  }, [parsedTasks, project?.slug, searchQuery]);

  const orderedRows = useMemo(() => orderTree(visibleTasks), [visibleTasks]);

  // El rango se calcula sobre todas las tareas con fecha, no sobre las que
  // filtra la busqueda: la escala no debe saltar al escribir.
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

  // HOY se marca sombreando la columna de la unidad actual, no con una linea.
  // Se toma del propio tramo de cabecera marcado como actual, asi cabecera y
  // cuerpo no se pueden desalinear.
  const todaySegment =
    headerBands?.bottom.find((segment) => segment.isCurrent) ?? null;

  // biome-ignore lint/correctness/useExhaustiveDependencies: se re-mide al aparecer/desaparecer la primera fila
  useLayoutEffect(() => {
    const first = rowsRef.current?.firstElementChild;
    if (!(first instanceof HTMLElement)) return;
    const measure = () =>
      setRowHeightPx(first.getBoundingClientRect().height || 32);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(first);
    return () => observer.disconnect();
  }, [orderedRows.length]);

  // Centrar en HOY al montar y al cambiar de zoom (el ancho de pista cambia).
  // biome-ignore lint/correctness/useExhaustiveDependencies: zoom/trackWidthPx son disparadores, no lecturas
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
      search: (previous: Record<string, unknown>) => ({
        ...previous,
        taskId: id,
      }),
      replace: true,
    });
  };

  const scrollByViewport = (direction: 1 | -1) => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    scroller.scrollBy({
      left: direction * scroller.clientWidth * 0.7,
      behavior: "smooth",
    });
  };

  const scrollToToday = () => {
    const scroller = scrollRef.current;
    const marker = scroller?.querySelector<HTMLElement>("[data-gantt-today]");
    if (!scroller || !marker) return;
    scroller.scrollTo({
      left: Math.max(
        0,
        marker.offsetLeft + marker.offsetWidth / 2 - scroller.clientWidth / 2,
      ),
      behavior: "smooth",
    });
  };

  const hasSchedule = timeline != null && parsedTasks.length > 0;
  const noMatches = hasSchedule && orderedRows.length === 0;

  return (
    <ProjectLayout
      projectId={projectId}
      workspaceId={workspaceId}
      activeView="gantt"
    >
      <PageTitle
        title={t("tasks:gantt.pageTitle", { name: project?.name })}
        hideAppName
      />
      <div className="flex h-full min-h-0 flex-col bg-background">
        <div className="border-border/80 border-b">
          <FilterBar
            fields={filterableFields}
            conditions={conditions}
            onChange={setConditions}
          />
        </div>

        <div className="border-border/80 border-b px-3 py-2.5 sm:px-4">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="mr-1 text-sm font-semibold text-foreground">
              {t("tasks:gantt.title")}
            </h1>

            {/* biome-ignore lint/a11y/useSemanticElements: control segmentado de zoom, no un fieldset de formulario */}
            <div
              className="inline-flex h-7 items-center gap-0.5 rounded-lg border border-border/80 bg-background p-0.5"
              role="group"
              aria-label={t("tasks:gantt.zoomLabel")}
            >
              {ZOOM_LEVELS.map((level) => (
                <Button
                  key={level}
                  type="button"
                  variant="ghost"
                  size="xs"
                  aria-pressed={zoom === level}
                  className={cn(
                    "h-6 rounded-md px-2 text-xs",
                    zoom === level
                      ? "bg-accent text-foreground shadow-[inset_0_-2px_0_var(--brand)] hover:bg-accent"
                      : "text-muted-foreground",
                  )}
                  onClick={() => setZoom(level)}
                >
                  {t(ZOOM_LABEL_KEY[level])}
                </Button>
              ))}
            </div>

            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon-xs"
                className="min-h-11 touch-manipulation sm:min-h-0"
                aria-label={t("tasks:gantt.previousRange")}
                onClick={() => scrollByViewport(-1)}
              >
                <ChevronLeft />
              </Button>
              <Button
                variant="outline"
                size="xs"
                className="min-h-11 touch-manipulation sm:min-h-0"
                onClick={scrollToToday}
              >
                {t("tasks:gantt.jumpToday")}
              </Button>
              <Button
                variant="outline"
                size="icon-xs"
                className="min-h-11 touch-manipulation sm:min-h-0"
                aria-label={t("tasks:gantt.nextRange")}
                onClick={() => scrollByViewport(1)}
              >
                <ChevronRight />
              </Button>
            </div>

            <div className="relative ml-auto w-full max-w-xs">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder={t("tasks:gantt.searchPlaceholder")}
                className="h-9 min-h-11 touch-manipulation sm:h-8 sm:min-h-0 [&_[data-slot=input]]:pl-8 [&_[data-slot=input]]:text-xs"
              />
            </div>

            <Button
              variant="outline"
              size="xs"
              className="min-h-11 touch-manipulation sm:hidden"
              onClick={() => setIsTaskRailOpen((current) => !current)}
            >
              {showTaskRail ? (
                <ChevronLeft className="size-3.5" />
              ) : (
                <ChevronRight className="size-3.5" />
              )}
              {showTaskRail
                ? t("tasks:gantt.hideTasks")
                : t("tasks:gantt.showTasks")}
            </Button>
          </div>
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
        ) : noMatches ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Search />
              </EmptyMedia>
              <EmptyTitle>{t("tasks:gantt.noTasksFound")}</EmptyTitle>
              <EmptyDescription>
                {t("tasks:gantt.noTasksMatch", { query: searchQuery })}
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
                {/* Cabecera de dos bandas, pegajosa arriba. */}
                <div className="sticky top-0 z-40 flex border-border border-b bg-background/92 backdrop-blur">
                  {showTaskRail && (
                    <div
                      className="sticky left-0 z-50 flex shrink-0 items-end border-border border-r bg-background px-3 pb-1"
                      style={{ width: railWidthRem }}
                    >
                      <span className="text-[0.6875rem] font-medium uppercase tracking-[0.06em] text-muted-foreground">
                        {t("tasks:gantt.taskHeader")}
                      </span>
                    </div>
                  )}
                  <div
                    className="relative shrink-0"
                    style={{ width: `${timeline.trackWidthPx}px` }}
                  >
                    <div className="relative h-[1.1rem] border-border/60 border-b">
                      {headerBands.top.map((segment) => (
                        <div
                          key={segment.key}
                          className="absolute inset-y-0 flex items-center truncate pl-1 text-[0.6875rem] uppercase tracking-[0.06em] text-muted-foreground"
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
                          aria-current={segment.isCurrent ? "date" : undefined}
                          className={cn(
                            "absolute inset-y-0 flex items-center justify-center overflow-hidden border-border/50 border-l text-[0.6875rem] text-muted-foreground",
                            segment.isCurrent &&
                              "bg-brand/10 font-semibold text-brand-strong",
                          )}
                          style={{
                            left: segment.leftPx,
                            width: segment.widthPx,
                          }}
                        >
                          {segment.label}
                          {segment.sub && (
                            <span className="ml-1 opacity-60">
                              {segment.sub}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Cuerpo. */}
                <div className="relative">
                  {todaySegment && (
                    <div
                      aria-hidden="true"
                      data-gantt-today
                      className="pointer-events-none absolute inset-y-0 z-0 bg-brand/8"
                      style={{
                        left: `calc(${railWidthCss} + ${todaySegment.leftPx}px)`,
                        width: `${todaySegment.widthPx}px`,
                      }}
                    />
                  )}

                  <div
                    className="pointer-events-none absolute inset-y-0 z-0"
                    style={{
                      left: railWidthCss,
                      width: `${timeline.trackWidthPx}px`,
                    }}
                  >
                    {headerBands.gridlines.map((line) => (
                      <div
                        key={line.key}
                        className="absolute inset-y-0 w-px bg-border/45"
                        style={{ left: line.leftPx }}
                      />
                    ))}
                  </div>

                  <GanttDependencyLayer
                    rows={orderedRows}
                    relations={relations ?? []}
                    timeline={timeline}
                    rowHeightPx={rowHeightPx}
                    leftOffset={railWidthCss}
                    className="z-[25]"
                  />

                  <div ref={rowsRef} className="flex flex-col">
                    {orderedRows.map(({ task, depth }) => {
                      const progress =
                        task.subtree && task.subtree.descendantCount > 0
                          ? task.subtree.progress
                          : null;
                      const rowTitle = [
                        `${project?.slug}-${task.number}`,
                        getStatusLabel(task.status),
                        `${formatDateShort(task.scheduleStart)} – ${formatDateShort(
                          task.scheduleEnd,
                        )}`,
                        task.assigneeName,
                      ]
                        .filter(Boolean)
                        .join(" · ");

                      return (
                        <div
                          key={task.id}
                          className="group/row flex items-stretch border-border/40 border-b transition-colors hover:bg-accent/25"
                          style={{
                            height: "calc(var(--density-row) - 0.3rem)",
                          }}
                        >
                          {showTaskRail && (
                            // El fondo opaco se queda en la celda pegajosa pase
                            // lo que pase: es lo que tapa las barras y la
                            // rejilla que pasan por debajo al desplazar. El
                            // tinte de hover va en el boton, que pinta encima y
                            // compone; puesto aqui lo sustituiria por un color
                            // con alfa y la celda se volveria transparente.
                            <div
                              className="sticky left-0 z-30 shrink-0 border-border border-r bg-background"
                              style={{ width: railWidthRem }}
                            >
                              <button
                                type="button"
                                title={rowTitle}
                                onClick={() => openTask(task.id)}
                                className="flex h-full w-full items-center gap-2 pr-2 text-left outline-none transition-colors group-hover/row:bg-accent/25 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                              >
                                <span
                                  aria-hidden="true"
                                  className={cn(
                                    "h-full w-[3px] shrink-0",
                                    PRIORITY_STRIPE[task.priority ?? ""] ??
                                      "bg-muted-foreground/30",
                                  )}
                                />
                                {depth > 0 && (
                                  <span
                                    aria-hidden="true"
                                    className="relative h-full shrink-0 before:absolute before:top-0 before:right-1.5 before:h-1/2 before:border-border/80 before:border-l after:absolute after:top-1/2 after:right-0 after:w-1.5 after:border-border/80 after:border-t"
                                    style={{ width: `${depth * 0.85}rem` }}
                                  />
                                )}
                                <span className="shrink-0 font-mono text-[0.6875rem] text-muted-foreground tabular-nums">
                                  {project?.slug}-{task.number}
                                </span>
                                <span className="min-w-0 flex-1 truncate font-medium text-foreground text-xs">
                                  {task.title}
                                </span>
                                {progress != null && (
                                  <span className="shrink-0 text-[0.6875rem] text-muted-foreground tabular-nums opacity-0 transition-opacity group-hover/row:opacity-100">
                                    {progress}%
                                  </span>
                                )}
                              </button>
                            </div>
                          )}

                          <div
                            className="relative shrink-0"
                            style={{ width: `${timeline.trackWidthPx}px` }}
                          >
                            <GanttTaskBar
                              task={task}
                              depth={depth}
                              isDone={doneIds.has(task.id)}
                              timeline={timeline}
                              isMobile={isMobile}
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

        <TaskDetailsSheet
          taskId={taskId}
          projectId={projectId}
          workspaceId={workspaceId}
          onClose={() =>
            navigate({
              to: ".",
              search: (previous: Record<string, unknown>) => ({
                ...previous,
                taskId: undefined,
              }),
              replace: true,
            })
          }
        />
      </div>
    </ProjectLayout>
  );
}
