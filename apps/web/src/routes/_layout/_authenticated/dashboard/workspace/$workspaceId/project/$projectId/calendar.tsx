import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { addMonths, startOfMonth, subMonths } from "date-fns";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import CalendarToolbar from "@/components/calendar/calendar-toolbar";
import MonthGrid from "@/components/calendar/month-grid";
import { buildMonthWeeks } from "@/components/calendar/month-grid-model";
import ProjectLayout from "@/components/common/project-layout";
import PageTitle from "@/components/page-title";
import { ExportViewMenu } from "@/components/project/export-view-menu";
import { SubprojectToggle } from "@/components/project/subproject-toggle";
import FilterBar from "@/components/table-view/filter-bar";
import TaskDetailsSheet from "@/components/task/task-details-sheet";
import { shortcuts } from "@/constants/shortcuts";
import { useGetTasks } from "@/hooks/queries/task/use-get-tasks";
import { useFilterableFields } from "@/hooks/use-filterable-fields";
import { useRegisterShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { useIsMobile } from "@/hooks/use-mobile";
import { readFilterParam, useUrlFilter } from "@/hooks/use-url-filter";
import { describeConditions } from "@/lib/describe-filter";
import { subprojectTasks } from "@/lib/subproject-tasks";
import { toScheduledTasks } from "@/lib/task-schedule";
import { useUserPreferencesStore } from "@/store/user-preferences";
import type { EditableCondition } from "@/types/task-filter";

type CalendarSearchParams = {
  taskId?: string;
  /** Las condiciones del filtro. Ver `useUrlFilter`. */
  filter?: EditableCondition[];
  /** Con las tareas de los subproyectos (ADR 089). */
  subprojects?: boolean;
};

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/workspace/$workspaceId/project/$projectId/calendar",
)({
  component: RouteComponent,
  validateSearch: (search: Record<string, unknown>): CalendarSearchParams => ({
    taskId: typeof search.taskId === "string" ? search.taskId : undefined,
    filter: readFilterParam(search.filter),
    subprojects: search.subprojects === true ? true : undefined,
  }),
});

// Lanes are capped so a busy week cannot push a row taller than the viewport;
// anything past the cap surfaces as a per-day overflow hint.
const MAX_LANES_DESKTOP = 3;
const MAX_LANES_MOBILE = 2;

function RouteComponent() {
  const { t } = useTranslation();
  const { projectId, workspaceId } = Route.useParams();
  const { taskId, filter: filterParam, subprojects } = Route.useSearch();
  const navigate = useNavigate();
  const { conditions, setConditions, filter } = useUrlFilter(filterParam);
  const filterableFields = useFilterableFields(projectId, workspaceId);
  const taskOptions = useMemo(
    () => ({ includeSubprojects: Boolean(subprojects) }),
    [subprojects],
  );
  const {
    data: project,
    isLoading,
    isError,
  } = useGetTasks(projectId, filter, taskOptions);
  const weekStartsOn = useUserPreferencesStore((state) => state.weekStartsOn);
  const setViewMode = useUserPreferencesStore((state) => state.setViewMode);
  const isMobile = useIsMobile();
  const [visibleMonth, setVisibleMonth] = useState(() =>
    startOfMonth(new Date()),
  );

  const scheduledTasks = useMemo(
    () =>
      toScheduledTasks(
        project && {
          columns: project.columns,
          plannedTasks: [...project.plannedTasks, ...subprojectTasks(project)],
        },
      ),
    [project],
  );

  const weeks = useMemo(
    () => buildMonthWeeks(visibleMonth, weekStartsOn),
    [visibleMonth, weekStartsOn],
  );

  const handlePreviousMonth = useCallback(() => {
    setVisibleMonth((current) => subMonths(current, 1));
  }, []);

  const handleNextMonth = useCallback(() => {
    setVisibleMonth((current) => addMonths(current, 1));
  }, []);

  const handleToday = useCallback(() => {
    setVisibleMonth(startOfMonth(new Date()));
  }, []);

  const handleOpenTask = useCallback(
    (nextTaskId: string) => {
      // Sin perder el filtro ni los subproyectos al abrir una tarea.
      navigate({
        to: ".",
        search: (previous: CalendarSearchParams) => ({
          ...previous,
          taskId: nextTaskId,
        }),
        replace: true,
      });
    },
    [navigate],
  );

  const handleCloseTaskSheet = useCallback(() => {
    navigate({
      to: ".",
      search: (previous: CalendarSearchParams) => ({
        ...previous,
        taskId: undefined,
      }),
      replace: true,
    });
  }, [navigate]);

  useRegisterShortcuts({
    sequentialShortcuts: {
      [shortcuts.view.prefix]: {
        [shortcuts.view.board]: () => {
          setViewMode("board");
          navigate({
            to: "/dashboard/workspace/$workspaceId/project/$projectId/board",
            params: { workspaceId, projectId },
          });
        },
        [shortcuts.view.list]: () => {
          setViewMode("list");
          navigate({
            to: "/dashboard/workspace/$workspaceId/project/$projectId/board",
            params: { workspaceId, projectId },
          });
        },
        [shortcuts.view.backlog]: () => {
          navigate({
            to: "/dashboard/workspace/$workspaceId/project/$projectId/backlog",
            params: { workspaceId, projectId },
          });
        },
        [shortcuts.view.gantt]: () => {
          navigate({
            to: "/dashboard/workspace/$workspaceId/project/$projectId/gantt",
            params: { workspaceId, projectId },
          });
        },
        [shortcuts.view.calendar]: () => {},
      },
    },
  });

  return (
    <ProjectLayout
      projectId={projectId}
      workspaceId={workspaceId}
      activeView="calendar"
    >
      <PageTitle
        title={t("tasks:calendar.pageTitle", { name: project?.name })}
        hideAppName
      />
      <div className="flex h-full min-h-0 flex-col bg-background">
        <CalendarToolbar
          visibleMonth={visibleMonth}
          onPreviousMonth={handlePreviousMonth}
          onNextMonth={handleNextMonth}
          onToday={handleToday}
        />

        {/* Hasta ahora el calendario no filtraba por nada: la deuda que el
            plan arrastra desde la Fase 1. Usa el mismo motor que la tabla, asi
            que un filtro escrito aqui vale igual alla. */}
        <div className="flex flex-wrap items-center border-border/80 border-b">
          <div className="min-w-0 flex-1">
            <FilterBar
              fields={filterableFields}
              conditions={conditions}
              onChange={setConditions}
            />
          </div>
          <div className="px-3">
            <ExportViewMenu
              projectId={projectId}
              filter={filter}
              title={`${t("tasks:calendar.title")} · ${project?.name ?? ""}`}
              subtitle={describeConditions(conditions, filterableFields, t)}
            />
          </div>
          <SubprojectToggle
            count={project?.subprojectCount ?? 0}
            checked={Boolean(subprojects)}
            onChange={(next) =>
              navigate({
                to: ".",
                search: (previous: CalendarSearchParams) => ({
                  ...previous,
                  subprojects: next ? true : undefined,
                }),
                replace: true,
              })
            }
          />
        </div>

        {isLoading ? (
          <div className="border-b border-border/80 px-4 py-3 text-center">
            <p className="text-sm text-muted-foreground">
              {t("common:empty.loading")}
            </p>
          </div>
        ) : isError ? (
          <div className="border-b border-border/80 px-4 py-3 text-center">
            <p className="text-sm font-semibold text-destructive">
              {t("tasks:calendar.loadError")}
            </p>
          </div>
        ) : scheduledTasks.length === 0 ? (
          <div className="border-b border-border/80 px-4 py-3 text-center">
            <p className="text-sm font-semibold text-foreground">
              {t("tasks:calendar.noTasks")}
            </p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {t("tasks:calendar.noTasksSubtitle")}
            </p>
          </div>
        ) : null}

        <MonthGrid
          weeks={weeks}
          tasks={scheduledTasks}
          visibleMonth={visibleMonth}
          maxLanes={isMobile ? MAX_LANES_MOBILE : MAX_LANES_DESKTOP}
          projectSlug={project?.slug}
          onOpenTask={handleOpenTask}
        />

        <TaskDetailsSheet
          taskId={taskId}
          projectId={projectId}
          workspaceId={workspaceId}
          onClose={handleCloseTaskSheet}
        />
      </div>
    </ProjectLayout>
  );
}
