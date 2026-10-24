import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { produce } from "immer";
import {
  ArrowRight,
  Calendar,
  Filter,
  Plus,
  User,
  Users,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import BacklogListView from "@/components/backlog-list-view";
import GroupControl from "@/components/common/group-control";
import ProjectLayout from "@/components/common/project-layout";
import SortControl from "@/components/common/sort-control";
import PageTitle from "@/components/page-title";
import CreateTaskModal from "@/components/shared/modals/create-task-modal";
import TaskDetailsSheet from "@/components/task/task-details-sheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/menu";
import { Skeleton } from "@/components/ui/skeleton";
import labelColors from "@/constants/label-colors";
import { shortcuts } from "@/constants/shortcuts";
import { useBulkOperations } from "@/hooks/mutations/task/use-bulk-operations";
import useGetLabelsByWorkspace from "@/hooks/queries/label/use-get-labels-by-workspace";
import { useGetTasks } from "@/hooks/queries/task/use-get-tasks";
import useGetTeams from "@/hooks/queries/team/use-get-teams";
import { useGetActiveWorkspaceUsers } from "@/hooks/queries/workspace-users/use-get-active-workspace-users";
import { useRegisterShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { useTaskGrouping } from "@/hooks/use-task-grouping";
import { getInitials } from "@/lib/get-initials";
import { getPriorityLabel } from "@/lib/i18n/domain";
import { getPriorityIcon } from "@/lib/priority";
import type { SortConfig } from "@/lib/sort-tasks";
import { sortTasks } from "@/lib/sort-tasks";
import {
  buildTaskViewFilter,
  DUE_DATE_FILTER_VALUES,
} from "@/lib/task-view-filter";
import { toast } from "@/lib/toast";
import useProjectStore from "@/store/project";
import { useUserPreferencesStore } from "@/store/user-preferences";

type BacklogSearchParams = {
  taskId?: string;
};

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/workspace/$workspaceId/project/$projectId/backlog",
)({
  component: RouteComponent,
  validateSearch: (search: Record<string, unknown>): BacklogSearchParams => ({
    taskId: typeof search.taskId === "string" ? search.taskId : undefined,
  }),
});

function RouteComponent() {
  const { t } = useTranslation();
  const { projectId, workspaceId } = Route.useParams();
  const { taskId } = Route.useSearch();
  const navigate = useNavigate();
  const { project, setProject } = useProjectStore();
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const { bulkMoveToBoard } = useBulkOperations();
  const [sort, setSort] = useState<SortConfig>({
    field: "position",
    direction: "asc",
  });

  const { groupBy, setGroupBy } = useTaskGrouping(projectId);

  const { data: users } = useGetActiveWorkspaceUsers(workspaceId);
  const { data: teams = [] } = useGetTeams({ workspaceId });
  const { data: workspaceLabels = [] } = useGetLabelsByWorkspace(workspaceId);

  const handleCloseTaskSheet = useCallback(() => {
    navigate({
      to: ".",
      search: {},
      replace: true,
    });
  }, [navigate]);

  const { setViewMode, weekStartsOn } = useUserPreferencesStore();

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
        [shortcuts.view.calendar]: () => {
          navigate({
            to: "/dashboard/workspace/$workspaceId/project/$projectId/calendar",
            params: { workspaceId, projectId },
          });
        },
        [shortcuts.view.gantt]: () => {
          navigate({
            to: "/dashboard/workspace/$workspaceId/project/$projectId/gantt",
            params: { workspaceId, projectId },
          });
        },
        [shortcuts.view.backlog]: () => {},
      },
    },
  });

  const [filters, setFilters] = useState({
    priority: null as string | null,
    assignee: null as string | null,
    team: null as string | null,
    dueDate: null as string | null,
    labels: [] as string[],
  });

  const updateFilter = (key: string, value: string | null) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const updateLabelFilter = (labelId: string) => {
    setFilters((prev) => ({
      ...prev,
      labels: prev.labels.includes(labelId)
        ? prev.labels.filter((id) => id !== labelId)
        : [...prev.labels, labelId],
    }));
  };

  const clearFilters = () => {
    setFilters({
      priority: null,
      assignee: null,
      team: null,
      dueDate: null,
      labels: [],
    });
  };

  const hasActiveFilters = Object.values(filters).some((filter) =>
    Array.isArray(filter) ? filter.length > 0 : filter !== null,
  );

  // El Backlog elige un valor por menu; el servidor recibe el mismo filtro que
  // en el resto de vistas (ADR 065).
  const labelNames = useMemo(
    () => new Map(workspaceLabels.map((l) => [l.id, l.name])),
    [workspaceLabels],
  );
  const filter = useMemo(
    () =>
      buildTaskViewFilter(
        {
          priority: filters.priority ? [filters.priority] : null,
          assignee: filters.assignee ? [filters.assignee] : null,
          team: filters.team ? [filters.team] : null,
          dueDate: filters.dueDate ? [filters.dueDate] : null,
          labels: filters.labels,
        },
        { weekStartsOn, labelNames },
      ),
    [filters, weekStartsOn, labelNames],
  );
  const { data } = useGetTasks(projectId, filter);

  useEffect(() => {
    if (data) {
      setProject(data);
    }
  }, [data, setProject]);

  const getTeamDisplayName = (teamId: string) => {
    const team = teams.find((item) => item.id === teamId);
    return team?.name || t("tasks:team.unknown");
  };

  const getAssigneeDisplayName = (userId: string) => {
    const member = users?.members?.find((m) => m.userId === userId);
    return member?.user?.name || t("common:people.unknown");
  };

  const uniqueLabels = workspaceLabels.reduce(
    (
      acc: { id: string; name: string; color: string }[],
      label: { id: string; name: string; color: string },
    ) => {
      const existing = acc.find(
        (l) => l.name === label.name && l.color === label.color,
      );
      if (!existing) {
        acc.push(label);
      }
      return acc;
    },
    [],
  );

  const isLabelGroupSelected = (label: { name: string; color: string }) => {
    return workspaceLabels
      .filter(
        (l: { name: string; color: string }) =>
          l.name === label.name && l.color === label.color,
      )
      .some((l: { id: string }) => filters.labels?.includes(l.id));
  };

  const toggleLabelGroup = (label: { name: string; color: string }) => {
    const matchingLabels = workspaceLabels.filter(
      (l: { name: string; color: string }) =>
        l.name === label.name && l.color === label.color,
    );

    const isAnySelected = matchingLabels.some((l: { id: string }) =>
      filters.labels?.includes(l.id),
    );

    if (isAnySelected) {
      for (const l of matchingLabels) {
        if (filters.labels?.includes(l.id)) {
          updateLabelFilter(l.id);
        }
      }
    } else {
      for (const l of matchingLabels) {
        if (!filters.labels?.includes(l.id)) {
          updateLabelFilter(l.id);
        }
      }
    }
  };

  // El almacen conserva el ultimo proyecto de cualquier vista: hasta que llegue
  // el de esta consulta, se muestra el esqueleto y no el de otro filtro.
  const shownProject = data ? project : null;

  const sortedProject = useMemo(() => {
    if (!shownProject || sort.field === "position") return shownProject;
    return {
      ...shownProject,
      plannedTasks: sortTasks(shownProject.plannedTasks || [], sort),
      archivedTasks: sortTasks(shownProject.archivedTasks || [], sort),
    };
  }, [shownProject, sort]);

  const handleMoveAllPlannedToBoard = () => {
    if (!project) return;

    const plannedTasks = project.plannedTasks || [];

    if (plannedTasks.length === 0) {
      toast.info(t("tasks:backlog.noTasksToMove"));
      return;
    }

    if (
      !confirm(
        t("tasks:backlog.moveAllConfirm", { count: plannedTasks.length }),
      )
    ) {
      return;
    }

    // El aviso dice «la primera columna», y eso es lo que se usa: con el slug
    // `to-do` fijo, un proyecto sin esa columna rechazaba el movimiento.
    const firstColumn = project.columns?.[0];
    if (!firstColumn) return;

    const previousProject = project;
    setProject(
      produce(project, (draft) => {
        const target = draft.columns?.find(
          (col) => col.slug === firstColumn.slug,
        );
        if (target && draft.plannedTasks) {
          target.tasks.push(
            ...draft.plannedTasks.map((task) => ({
              ...task,
              status: firstColumn.slug,
            })),
          );
          draft.plannedTasks = [];
        }
      }),
    );
    bulkMoveToBoard({
      taskIds: plannedTasks.map((task) => task.id),
      status: firstColumn.slug,
    }).then(
      () =>
        toast.success(
          t("tasks:backlog.moveAllSuccess", { count: plannedTasks.length }),
        ),
      () => {
        setProject(previousProject);
        toast.error(t("tasks:update.error"));
      },
    );
  };

  return (
    <ProjectLayout
      projectId={projectId}
      workspaceId={workspaceId}
      activeView="backlog"
    >
      <PageTitle
        title={t("tasks:backlog.pageTitle", { name: project?.name })}
      />
      <div className="relative flex flex-col h-full min-h-0 overflow-hidden">
        <div className="border-border/80 border-b bg-card/80 backdrop-blur supports-[backdrop-filter]:bg-card/70">
          <div className="flex min-h-12 items-center px-3 py-2 md:px-4">
            <div className="flex w-full items-center gap-2">
              <div className="flex w-full flex-wrap items-center gap-1.5">
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => setIsTaskModalOpen(true)}
                  className="h-6 px-2 text-xs text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                >
                  <Plus className="h-3 w-3 mr-1" />
                  {t("tasks:backlog.plan")}
                </Button>

                <Button
                  variant="ghost"
                  size="xs"
                  onClick={handleMoveAllPlannedToBoard}
                  className="h-6 px-2 text-xs text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  title={t("tasks:backlog.moveAllTooltip")}
                >
                  <ArrowRight className="h-3 w-3 mr-1" />
                  {t("tasks:backlog.moveAll")}
                </Button>

                {filters.priority && (
                  <Button
                    variant="secondary"
                    size="xs"
                    className="h-7 rounded-md px-2 text-xs font-medium gap-1.5"
                  >
                    {getPriorityIcon(filters.priority)}
                    <span>
                      {t("tasks:backlog.filters.priority", {
                        name: getPriorityLabel(filters.priority),
                      })}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-4 w-4 p-0 ml-1 hover:bg-destructive hover:text-destructive-foreground"
                      onClick={(e) => {
                        e.stopPropagation();
                        updateFilter("priority", null);
                      }}
                    >
                      <X className="h-2.5 w-2.5" />
                    </Button>
                  </Button>
                )}

                {filters.assignee && (
                  <Button
                    variant="secondary"
                    size="xs"
                    className="h-7 rounded-md px-2 text-xs font-medium gap-1.5"
                  >
                    <User className="h-3 w-3" />
                    <span>
                      {t("tasks:backlog.filters.assignee", {
                        name: getAssigneeDisplayName(filters.assignee),
                      })}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-4 w-4 p-0 ml-1 hover:bg-destructive hover:text-destructive-foreground"
                      onClick={(e) => {
                        e.stopPropagation();
                        updateFilter("assignee", null);
                      }}
                    >
                      <X className="h-2.5 w-2.5" />
                    </Button>
                  </Button>
                )}

                {filters.team && (
                  <Button
                    variant="secondary"
                    size="xs"
                    className="h-7 rounded-md px-2 text-xs font-medium gap-1.5"
                  >
                    <Users className="h-3 w-3" />
                    <span>
                      {t("tasks:backlog.filters.team", {
                        name: getTeamDisplayName(filters.team),
                      })}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-4 w-4 p-0 ml-1 hover:bg-destructive hover:text-destructive-foreground"
                      onClick={(e) => {
                        e.stopPropagation();
                        updateFilter("team", null);
                      }}
                    >
                      <X className="h-2.5 w-2.5" />
                    </Button>
                  </Button>
                )}

                {filters.dueDate && (
                  <Button
                    variant="secondary"
                    size="xs"
                    className="h-7 rounded-md px-2 text-xs font-medium gap-1.5"
                  >
                    <Calendar className="h-3 w-3" />
                    <span>
                      {t("tasks:backlog.filters.due", {
                        date: t(
                          filters.dueDate === DUE_DATE_FILTER_VALUES.dueThisWeek
                            ? "tasks:backlog.filters.dueThisWeek"
                            : filters.dueDate ===
                                DUE_DATE_FILTER_VALUES.dueNextWeek
                              ? "tasks:backlog.filters.dueNextWeek"
                              : "tasks:backlog.filters.noDueDate",
                          { defaultValue: filters.dueDate },
                        ),
                      })}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-4 w-4 p-0 ml-1 hover:bg-destructive hover:text-destructive-foreground"
                      onClick={(e) => {
                        e.stopPropagation();
                        updateFilter("dueDate", null);
                      }}
                    >
                      <X className="h-2.5 w-2.5" />
                    </Button>
                  </Button>
                )}

                {filters.labels &&
                  filters.labels.length > 0 &&
                  uniqueLabels
                    .filter((uniqueLabel) =>
                      workspaceLabels
                        .filter(
                          (l: { name: string; color: string }) =>
                            l.name === uniqueLabel.name &&
                            l.color === uniqueLabel.color,
                        )
                        .some((l: { id: string }) =>
                          filters.labels?.includes(l.id),
                        ),
                    )
                    .map((label) => (
                      <Button
                        key={`${label.name}-${label.color}`}
                        variant="secondary"
                        size="xs"
                        className="h-7 rounded-md px-2 text-xs font-medium gap-1.5"
                      >
                        <span
                          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                          style={{
                            backgroundColor:
                              labelColors.find((c) => c.value === label.color)
                                ?.color || "var(--color-neutral-400)",
                          }}
                        />
                        <span>
                          {t("tasks:backlog.filters.label", {
                            name: label.name,
                          })}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-4 w-4 p-0 ml-1 hover:bg-destructive hover:text-destructive-foreground"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleLabelGroup(label);
                          }}
                        >
                          <X className="h-2.5 w-2.5" />
                        </Button>
                      </Button>
                    ))}

                <SortControl sort={sort} onSortChange={setSort} />

                <GroupControl groupBy={groupBy} onGroupByChange={setGroupBy} />

                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 gap-2 px-2.5 text-xs font-medium text-foreground"
                      />
                    }
                  >
                    <Filter className="h-3.5 w-3.5" />
                    {t("tasks:backlog.filter")}
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-80" align="start">
                    <DropdownMenuItem
                      disabled
                      className="h-8 rounded-md border border-border/80 bg-card text-sm text-muted-foreground"
                    >
                      {t("tasks:backlog.addFilter")}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    {hasActiveFilters && (
                      <>
                        <DropdownMenuItem
                          onClick={clearFilters}
                          className="h-8 text-sm text-muted-foreground"
                        >
                          <span>{t("common:actions.clearAllFilters")}</span>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                      </>
                    )}
                    <DropdownMenuGroup>
                      <DropdownMenuLabel className="text-label uppercase">
                        {t("tasks:priority.label")}
                      </DropdownMenuLabel>
                    </DropdownMenuGroup>
                    {["urgent", "high", "medium", "low"].map((priority) => (
                      <DropdownMenuCheckboxItem
                        key={priority}
                        checked={filters.priority === priority}
                        onCheckedChange={(checked) =>
                          updateFilter("priority", checked ? priority : null)
                        }
                        className="h-8 rounded-md text-sm [&_svg]:text-sidebar-foreground"
                      >
                        <div className="flex gap-2 items-center">
                          {getPriorityIcon(priority)}
                          <span className="capitalize">
                            {getPriorityLabel(priority)}
                          </span>
                        </div>
                      </DropdownMenuCheckboxItem>
                    ))}

                    <DropdownMenuSeparator />
                    <DropdownMenuGroup>
                      <DropdownMenuLabel className="text-label uppercase">
                        {t("tasks:assignee.label")}
                      </DropdownMenuLabel>
                    </DropdownMenuGroup>
                    {users?.members?.map((member) => (
                      <DropdownMenuCheckboxItem
                        key={member.userId}
                        checked={filters.assignee === member.userId}
                        onCheckedChange={(checked) =>
                          updateFilter(
                            "assignee",
                            checked ? member.userId : null,
                          )
                        }
                        className="h-8 rounded-md text-sm"
                      >
                        <Avatar className="h-6 w-6 mr-2">
                          <AvatarImage
                            src={member.user?.image ?? ""}
                            alt={member.user?.name || ""}
                          />
                          <AvatarFallback className="text-xs font-medium border border-border/30">
                            {getInitials(member.user?.name)}
                          </AvatarFallback>
                        </Avatar>
                        <span>{member.user?.name}</span>
                      </DropdownMenuCheckboxItem>
                    ))}

                    <DropdownMenuSeparator />
                    <DropdownMenuGroup>
                      <DropdownMenuLabel className="text-label uppercase">
                        {t("tasks:team.label")}
                      </DropdownMenuLabel>
                    </DropdownMenuGroup>
                    {teams.map((team) => (
                      <DropdownMenuCheckboxItem
                        key={team.id}
                        checked={filters.team === team.id}
                        onCheckedChange={(checked) =>
                          updateFilter("team", checked ? team.id : null)
                        }
                        className="h-8 rounded-md text-sm"
                      >
                        <Users className="h-4 w-4 mr-2 text-muted-foreground" />
                        <span className="truncate">{team.name}</span>
                      </DropdownMenuCheckboxItem>
                    ))}

                    <DropdownMenuSeparator />
                    <DropdownMenuGroup>
                      <DropdownMenuLabel className="text-label uppercase">
                        {t("tasks:dueDate.label")}
                      </DropdownMenuLabel>
                    </DropdownMenuGroup>
                    {[
                      {
                        label: DUE_DATE_FILTER_VALUES.dueThisWeek,
                        key: "dueThisWeek",
                      },
                      {
                        label: DUE_DATE_FILTER_VALUES.dueNextWeek,
                        key: "dueNextWeek",
                      },
                      {
                        label: DUE_DATE_FILTER_VALUES.noDueDate,
                        key: "noDueDate",
                      },
                    ].map((item) => (
                      <DropdownMenuCheckboxItem
                        key={item.label}
                        checked={filters.dueDate === item.label}
                        onCheckedChange={(checked) =>
                          updateFilter("dueDate", checked ? item.label : null)
                        }
                        className="h-8 rounded-md text-sm"
                      >
                        <span>{t(`tasks:backlog.filters.${item.key}`)}</span>
                      </DropdownMenuCheckboxItem>
                    ))}

                    <DropdownMenuSeparator />
                    <DropdownMenuGroup>
                      <DropdownMenuLabel className="text-label uppercase">
                        {t("tasks:labels.label")}
                      </DropdownMenuLabel>
                    </DropdownMenuGroup>
                    {uniqueLabels.length > 0 ? (
                      uniqueLabels.map(
                        (label: {
                          id: string;
                          name: string;
                          color: string;
                        }) => (
                          <DropdownMenuCheckboxItem
                            key={label.id}
                            checked={isLabelGroupSelected(label)}
                            onCheckedChange={() => toggleLabelGroup(label)}
                            className="h-8 rounded-md text-sm"
                          >
                            <span
                              className="w-3 h-3 rounded-full flex-shrink-0"
                              style={{
                                backgroundColor:
                                  labelColors.find(
                                    (c) => c.value === label.color,
                                  )?.color || "var(--color-neutral-400)",
                              }}
                            />
                            <span className="max-w-20 truncate">
                              {label.name}
                            </span>
                          </DropdownMenuCheckboxItem>
                        ),
                      )
                    ) : (
                      <DropdownMenuItem
                        disabled
                        className="h-8 rounded-md text-sm text-muted-foreground"
                      >
                        <span>{t("tasks:labels.empty")}</span>
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-hidden bg-card h-full">
          {sortedProject ? (
            <BacklogListView
              project={sortedProject}
              disableDragDrop={sort.field !== "position"}
              groupBy={groupBy}
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <div className="text-center space-y-4">
                <Skeleton className="w-16 h-16 rounded-lg mx-auto" />
                <div className="space-y-2">
                  <Skeleton className="w-48 h-4 mx-auto" />
                  <Skeleton className="w-64 h-3 mx-auto" />
                </div>
              </div>
            </div>
          )}
        </div>

        <CreateTaskModal
          open={isTaskModalOpen}
          projectId={projectId}
          onClose={() => setIsTaskModalOpen(false)}
          status="planned"
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
