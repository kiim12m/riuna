import { useLocation, useNavigate } from "@tanstack/react-router";
import {
  CalendarDays,
  CalendarRange,
  Info,
  SquareKanban,
  SquircleDashed,
  Table2,
  Target,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import MobileProjectNav from "@/components/common/header/mobile-project-nav";
import { NewTaskButton } from "@/components/common/header/new-task-button";
import ProjectCrumbSelect from "@/components/common/header/project-crumb-select";
import WorkspaceCrumbSelect from "@/components/common/header/workspace-crumb-select";
import Layout from "@/components/common/layout";
import { MobileHeaderBell } from "@/components/notification/mobile-header-bell";
import { useAuth } from "@/components/providers/auth-provider/hooks/use-auth";
import { QuickAddInput } from "@/components/quick-add/quick-add-input";
import CreateProjectModal from "@/components/shared/modals/create-project-modal";
import { Button } from "@/components/ui/button";
import { KbdSequence } from "@/components/ui/kbd";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { SidebarTrigger } from "@/components/ui/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { shortcuts } from "@/constants/shortcuts";
import useGetProject from "@/hooks/queries/project/use-get-project";
import { useProjectWebSocket } from "@/hooks/use-project-websocket";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { cn } from "@/lib/cn";

type ProjectLayoutProps = {
  projectId: string;
  workspaceId: string;
  headerActions?: ReactNode;
  children: ReactNode;
  showViewSwitcher?: boolean;
  activeView?: "backlog" | "board" | "calendar" | "gantt" | "table" | "cycles";
};

// La vista activa se marca con el tinte de --accent y un raíl de 2 px en River
// Teal (ADR 007). El hover de las inactivas ya lo pone el botón ghost.
function viewTabClass(isActive: boolean) {
  return cn(
    "h-6 gap-1.5 rounded-md px-2 text-xs",
    isActive
      ? "bg-accent text-foreground shadow-[inset_0_-2px_0_var(--brand)] hover:bg-accent"
      : "text-muted-foreground",
  );
}

export default function ProjectLayout({
  projectId,
  workspaceId,
  headerActions,
  children,
  showViewSwitcher = true,
  activeView,
}: ProjectLayoutProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { data: project } = useGetProject({ id: projectId, workspaceId });
  const { user } = useAuth();
  const { canCreateTasks } = useWorkspacePermission();
  // En la Bandeja propia, la captura rapida a mano: es a lo que se viene.
  const isOwnInbox =
    Boolean(project?.ownerUserId) && project?.ownerUserId === user?.id;
  const [isCreateProjectModalOpen, setIsCreateProjectModalOpen] =
    useState(false);

  useProjectWebSocket(projectId);

  const resolvedView =
    activeView ??
    (location.pathname.includes("/backlog")
      ? "backlog"
      : location.pathname.includes("/calendar")
        ? "calendar"
        : location.pathname.includes("/gantt")
          ? "gantt"
          : location.pathname.includes("/table")
            ? "table"
            : location.pathname.includes("/cycles")
              ? "cycles"
              : "board");

  const handleNavigateToBacklog = () => {
    navigate({
      to: "/dashboard/workspace/$workspaceId/project/$projectId/backlog",
      params: { workspaceId, projectId },
    });
  };

  const handleNavigateToBoard = () => {
    navigate({
      to: "/dashboard/workspace/$workspaceId/project/$projectId/board",
      params: { workspaceId, projectId },
    });
  };

  const handleNavigateToCalendar = () => {
    navigate({
      to: "/dashboard/workspace/$workspaceId/project/$projectId/calendar",
      params: { workspaceId, projectId },
    });
  };

  const handleNavigateToGantt = () => {
    navigate({
      to: "/dashboard/workspace/$workspaceId/project/$projectId/gantt",
      params: { workspaceId, projectId },
    });
  };

  const handleNavigateToTable = () => {
    navigate({
      to: "/dashboard/workspace/$workspaceId/project/$projectId/table",
      params: { workspaceId, projectId },
    });
  };

  const handleNavigateToCycles = () => {
    navigate({
      to: "/dashboard/workspace/$workspaceId/project/$projectId/cycles",
      params: { workspaceId, projectId },
    });
  };

  const handleProjectSwitch = (nextProjectId: string) => {
    navigate({
      to:
        resolvedView === "backlog"
          ? "/dashboard/workspace/$workspaceId/project/$projectId/backlog"
          : resolvedView === "calendar"
            ? "/dashboard/workspace/$workspaceId/project/$projectId/calendar"
            : resolvedView === "gantt"
              ? "/dashboard/workspace/$workspaceId/project/$projectId/gantt"
              : resolvedView === "table"
                ? "/dashboard/workspace/$workspaceId/project/$projectId/table"
                : resolvedView === "cycles"
                  ? "/dashboard/workspace/$workspaceId/project/$projectId/cycles"
                  : "/dashboard/workspace/$workspaceId/project/$projectId/board",
      params: {
        workspaceId,
        projectId: nextProjectId,
      },
    });
  };

  return (
    <Layout>
      <Layout.Header className="h-11 border-border/80 px-2">
        <div className="flex w-full items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <SidebarTrigger className="-ml-1 h-7 w-7 cursor-pointer text-foreground/85 hover:text-foreground md:hidden" />
                </TooltipTrigger>
                <TooltipContent>
                  <p className="flex items-center gap-2 text-meta">
                    {t("common:a11y.toggleSidebar")}
                    <KbdSequence
                      keys={[
                        shortcuts.sidebar.prefix,
                        shortcuts.sidebar.toggle,
                      ]}
                    />
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <div className="h-4 w-px shrink-0 bg-border/80 md:hidden" />

            <div className="hidden min-w-0 items-center gap-1 md:flex">
              <WorkspaceCrumbSelect />
              <span className="text-foreground/30 text-xs">/</span>
              <ProjectCrumbSelect
                workspaceId={workspaceId}
                projectId={projectId}
                projectName={project?.name}
                onSelectProject={handleProjectSwitch}
                onAddProject={() => setIsCreateProjectModalOpen(true)}
              />
            </div>

            <div className="md:hidden">
              <MobileProjectNav
                workspaceId={workspaceId}
                projectId={projectId}
                activeView={resolvedView}
                onSelectBacklog={handleNavigateToBacklog}
                onSelectBoard={handleNavigateToBoard}
                onSelectCalendar={handleNavigateToCalendar}
                onSelectGantt={handleNavigateToGantt}
                onSelectTable={handleNavigateToTable}
                onSelectCycles={handleNavigateToCycles}
                onSelectProject={handleProjectSwitch}
                onAddProject={() => setIsCreateProjectModalOpen(true)}
              />
            </div>

            {/* Oculta, no privada (ADR 051): que nadie la tome por privada. Un
                popover y no un tooltip, para que tambien se lea en tactil. */}
            {project?.ownerUserId && (
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    size="xs"
                    className="h-7 w-7 shrink-0 px-0 text-muted-foreground"
                    aria-label={t("navigation:inbox.visibilityLabel")}
                  >
                    <Info className="size-3.5" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="max-w-xs" align="start">
                  <p className="p-2 text-sm">
                    {t("navigation:inbox.notPrivate")}
                  </p>
                </PopoverContent>
              </Popover>
            )}

            {showViewSwitcher && (
              <div className="hidden h-7 items-center gap-0.5 rounded-lg border border-border/80 bg-background p-0.5 sm:inline-flex">
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={handleNavigateToBacklog}
                  className={viewTabClass(resolvedView === "backlog")}
                >
                  <SquircleDashed className="size-3.5" />
                  {t("tasks:backlog.title")}
                </Button>
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={handleNavigateToBoard}
                  className={viewTabClass(resolvedView === "board")}
                >
                  <SquareKanban className="size-3.5" />
                  {t("tasks:board.title")}
                </Button>
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={handleNavigateToCalendar}
                  className={viewTabClass(resolvedView === "calendar")}
                >
                  <CalendarRange className="size-3.5" />
                  {t("tasks:calendar.title")}
                </Button>
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={handleNavigateToGantt}
                  className={viewTabClass(resolvedView === "gantt")}
                >
                  <CalendarDays className="size-3.5" />
                  Gantt
                </Button>
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={handleNavigateToTable}
                  className={viewTabClass(resolvedView === "table")}
                >
                  <Table2 className="size-3.5" />
                  {t("tasks:table.title")}
                </Button>
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={handleNavigateToCycles}
                  className={viewTabClass(resolvedView === "cycles")}
                >
                  <Target className="size-3.5" />
                  {t("cycles:title")}
                </Button>
              </div>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            <NewTaskButton />
            {headerActions}
            <MobileHeaderBell />
          </div>
        </div>
      </Layout.Header>

      {isOwnInbox && canCreateTasks() && (
        <div className="shrink-0 border-border/80 border-b px-3 py-2">
          <QuickAddInput workspaceId={workspaceId} showHint={false} />
        </div>
      )}

      <Layout.Content>{children}</Layout.Content>

      <CreateProjectModal
        open={isCreateProjectModalOpen}
        onClose={() => setIsCreateProjectModalOpen(false)}
      />
    </Layout>
  );
}
