import { useLocation, useNavigate } from "@tanstack/react-router";
import { ArrowDownIcon, ArrowUpIcon, CornerDownLeftIcon } from "lucide-react";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import SearchCommandMenu from "@/components/search-command-menu";
import CreateTaskModal from "@/components/shared/modals/create-task-modal";
import CreateWorkspaceModal from "@/components/shared/modals/create-workspace-modal";
import { StopDialog } from "@/components/timer/stop-dialog";
import {
  Command,
  CommandCollection,
  CommandDialog,
  CommandDialogPopup,
  CommandEmpty,
  CommandFooter,
  CommandGroup,
  CommandGroupLabel,
  CommandInput,
  CommandItem,
  CommandList,
  CommandPanel,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { shortcuts } from "@/constants/shortcuts";
import { useTimerMutations } from "@/hooks/mutations/time-entry/use-timer-mutations";
import useGetConfig from "@/hooks/queries/config/use-get-config";
import useGetProjects from "@/hooks/queries/project/use-get-projects";
import { useRunningTimer } from "@/hooks/queries/time-entry/use-running-timer";
import useActiveWorkspace from "@/hooks/queries/workspace/use-active-workspace";
import { useRegisterShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { authClient } from "@/lib/auth-client";
import { useQuickAddStore } from "@/store/quick-add";
import { useShortcutsHelpStore } from "@/store/shortcuts-help";
import { useUserPreferencesStore } from "@/store/user-preferences";
import CreateProjectModal from "../shared/modals/create-project-modal";

type PaletteActionItem = {
  value: string;
  label: string;
  shortcut?: string;
  onRun: () => void;
};

/** Diez horas: mas alla, un cronometro olvidado (`useStopWithConfirm`). */
const LONG_RUNNING_SECONDS = 10 * 60 * 60;

type PaletteGroup = {
  value: string;
  label: string;
  items: PaletteActionItem[];
};

function CommandPalette() {
  const { t } = useTranslation();
  const { setTheme } = useUserPreferencesStore();
  const navigate = useNavigate();
  const location = useLocation();
  const { data: workspace } = useActiveWorkspace();
  const { data: session } = authClient.useSession();
  const { data: config } = useGetConfig();
  const isAdmin = session?.user?.role === "admin";
  const canCreateWorkspace =
    isAdmin || (config !== undefined && !config.disableWorkspaceCreation);
  const [open, setOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isCreateTaskOpen, setIsCreateTaskOpen] = useState(false);
  const [isCreateProjectOpen, setIsCreateProjectOpen] = useState(false);
  const [isCreateWorkspaceOpen, setIsCreateWorkspaceOpen] = useState(false);
  const projectIdFromRoute =
    location.pathname.match(/\/project\/([^/]+)/)?.[1] ?? undefined;
  const isBacklogView = location.pathname.endsWith("/backlog");
  const workspaceId = workspace?.id ?? "";
  const { data: projects = [] } = useGetProjects({ workspaceId });
  const { data: timer } = useRunningTimer(workspaceId);
  const { start, stop, isStopping } = useTimerMutations(workspaceId);
  const [stopDialogOpen, setStopDialogOpen] = useState(false);
  const setHelpOpen = useShortcutsHelpStore((state) => state.setOpen);
  const setQuickAddOpen = useQuickAddStore((state) => state.setOpen);

  // Sin `?` aqui: lo atiende el propio dialogo de ayuda, que escucha la
  // tecla real. Registrarlo en el proveedor y despacharlo de nuevo era un
  // bucle (ver `store/shortcuts-help.ts`).
  useRegisterShortcuts({
    modifierShortcuts: {
      [shortcuts.palette.prefix]: {
        [shortcuts.palette.open]: () => {
          setOpen((prev) => !prev);
        },
      },
    },
    sequentialShortcuts: {
      [shortcuts.project.prefix]: {
        // La raiz del espacio lleva ahora a Hoy (interludio, bloque 5), asi
        // que "ir a la lista de proyectos" abre la paleta, que los lista.
        [shortcuts.project.list]: () => setOpen(true),
        [shortcuts.project.create]: () => setIsCreateProjectOpen(true),
      },
      [shortcuts.task.prefix]: {
        [shortcuts.task.create]: () => setIsCreateTaskOpen(true),
      },
      [shortcuts.workspace.prefix]: {
        [shortcuts.workspace.create]: () => {
          if (!canCreateWorkspace) return;
          setIsCreateWorkspaceOpen(true);
        },
      },
    },
  });

  const runCommand = useCallback((command: () => void) => {
    command();
    setOpen(false);
  }, []);

  // Las pantallas personales: hasta ahora la paleta no llevaba a ninguna.
  const goToGroup = useMemo<PaletteGroup>(() => {
    const screens = [
      { value: "today", to: "today", label: t("navigation:sidebar.today") },
      { value: "inbox", to: "inbox", label: t("navigation:sidebar.inbox") },
      {
        value: "planner",
        to: "planner",
        label: t("navigation:sidebar.planner"),
      },
      {
        value: "schedule",
        to: "schedule",
        label: t("navigation:sidebar.schedule"),
      },
      {
        value: "my-tasks",
        to: "my-tasks",
        label: t("navigation:sidebar.myTasks"),
      },
      {
        value: "time-sheet",
        to: "time-sheet",
        label: t("navigation:sidebar.timeSheet"),
      },
      { value: "home", to: "home", label: t("navigation:sidebar.home") },
      { value: "goals", to: "goals", label: t("navigation:sidebar.goals") },
      // Los avisos del espacio no tienen hueco en la barra (ADR 061, 081).
      {
        value: "announcements",
        to: "announcements",
        label: t("announcements:workspaceTitle"),
      },
      // Los rituales solo se abren a peticion (ADR 054): un boton o esto.
      {
        value: "plan-day",
        to: "rituals/plan-day",
        label: t("rituals:planDay.title"),
      },
      {
        value: "close-day",
        to: "rituals/close-day",
        label: t("rituals:closeDay.title"),
      },
      {
        value: "weekly-review",
        to: "rituals/weekly-review",
        label: t("rituals:weeklyReview.title"),
      },
    ] as const;

    return {
      value: "go-to",
      label: t("navigation:commandPalette.goTo"),
      items: screens.map((screen) => ({
        value: `go-to-${screen.value}`,
        label: screen.label,
        onRun: () =>
          navigate({
            to: `/dashboard/workspace/$workspaceId/${screen.to}`,
            params: { workspaceId },
          }),
      })),
    };
  }, [navigate, t, workspaceId]);

  // Parar lo que corre -con la misma pregunta de hora de fin que el pie si
  // lleva mas de diez horas- o reanudar la ultima tarea sin terminar.
  const timerGroup = useMemo<PaletteGroup>(() => {
    const running = timer?.running;
    const last = timer?.last;
    const items: PaletteActionItem[] = [];
    if (running) {
      items.push({
        value: "timer-stop",
        label: t("timer:stop"),
        onRun: () => {
          const seconds =
            (Date.now() - new Date(running.startTime).getTime()) / 1000;
          if (seconds > LONG_RUNNING_SECONDS) {
            setTimeout(() => setStopDialogOpen(true), 100);
          } else {
            stop();
          }
        },
      });
    } else if (last) {
      items.push({
        value: "timer-resume",
        label: t("timer:resumeTask", { title: last.taskTitle }),
        onRun: () =>
          start({
            id: last.taskId,
            number: last.taskNumber,
            title: last.taskTitle,
            projectId: last.projectId,
            estimate: null,
          }),
      });
    }
    return {
      value: "timer",
      label: t("navigation:commandPalette.timer"),
      items,
    };
  }, [t, timer, start, stop]);

  // `p l` abre la paleta: aqui estan los proyectos del espacio.
  const projectsGroup = useMemo<PaletteGroup>(
    () => ({
      value: "projects",
      label: t("navigation:commandPalette.projects"),
      items: projects
        .filter((project) => !project.archivedAt)
        .map((project) => ({
          value: `project-${project.id}`,
          label: project.name,
          onRun: () =>
            navigate({
              to: "/dashboard/workspace/$workspaceId/project/$projectId/board",
              params: { workspaceId, projectId: project.id },
            }),
        })),
    }),
    [navigate, t, projects, workspaceId],
  );

  const groupedItems = useMemo<PaletteGroup[]>(
    () =>
      [
        {
          value: "suggestions",
          label: t("navigation:commandPalette.suggestions"),
          items: [
            {
              value: "projects",
              label: t("navigation:commandPalette.projects"),
              onRun: () => {
                if (!workspace?.id) return;
                navigate({
                  to: "/dashboard/workspace/$workspaceId/admin/projects",
                  params: { workspaceId: workspace.id },
                });
              },
            },
            {
              value: "search",
              label: t("navigation:commandPalette.search"),
              shortcut: shortcuts.search.prefix,
              onRun: () => setIsSearchOpen(true),
            },
            {
              value: "members",
              label: t("navigation:commandPalette.members", {
                defaultValue: "Members",
              }),
              onRun: () => {
                if (!workspace?.id) return;
                navigate({
                  to: "/dashboard/workspace/$workspaceId/members",
                  params: { workspaceId: workspace.id },
                });
              },
            },
            {
              value: "create-task",
              label: t("navigation:commandPalette.createTask"),
              shortcut: `${shortcuts.task.prefix} ${shortcuts.task.create}`,
              onRun: () => setIsCreateTaskOpen(true),
            },
            // Sin `shortcut`: la paleta dispara los de sus elementos mientras
            // se escribe en ella, y `q` saltaria con cualquier busqueda que la
            // lleve. Fuera de la paleta la abre `q` (`WorkspaceRuntime`).
            ...(workspace?.id
              ? [
                  {
                    value: "quick-add",
                    label: t("quickAdd:dialogTitle"),
                    onRun: () => setTimeout(() => setQuickAddOpen(true), 100),
                  },
                ]
              : []),
            {
              value: "create-project",
              label: t("navigation:commandPalette.createProject"),
              shortcut: `${shortcuts.project.prefix} ${shortcuts.project.create}`,
              onRun: () => setIsCreateProjectOpen(true),
            },
          ],
        },
        {
          value: "commands",
          label: t("navigation:commandPalette.commands"),
          items: [
            ...(canCreateWorkspace
              ? [
                  {
                    value: "create-workspace",
                    label: t("navigation:commandPalette.createWorkspace"),
                    shortcut: `${shortcuts.workspace.prefix} ${shortcuts.workspace.create}`,
                    onRun: () => setIsCreateWorkspaceOpen(true),
                  },
                ]
              : []),
            {
              value: "theme-light",
              label: t("navigation:commandPalette.lightTheme"),
              onRun: () => setTheme("light"),
            },
            {
              value: "theme-dark",
              label: t("navigation:commandPalette.darkTheme"),
              onRun: () => setTheme("dark"),
            },
            {
              value: "theme-system",
              label: t("navigation:commandPalette.systemTheme"),
              onRun: () => setTheme("system"),
            },
            {
              value: "keyboard-shortcuts",
              label: t("navigation:commandPalette.keyboardShortcuts"),
              shortcut: "?",
              // Un respiro para que la paleta termine de cerrarse antes de
              // abrir otro dialogo encima.
              onRun: () => setTimeout(() => setHelpOpen(true), 100),
            },
          ],
        },
        ...(workspace?.id ? [goToGroup, timerGroup, projectsGroup] : []),
      ].filter((group) => group.items.length > 0),
    [
      navigate,
      setTheme,
      t,
      workspace?.id,
      canCreateWorkspace,
      setHelpOpen,
      setQuickAddOpen,
      goToGroup,
      timerGroup,
      projectsGroup,
    ],
  );

  const shortcutHandlers = useMemo(() => {
    const handlers = new Map<string, () => void>();
    for (const group of groupedItems) {
      for (const item of group.items) {
        if (!item.shortcut) continue;
        handlers.set(
          item.shortcut.replace(/\s+/g, "").toLowerCase(),
          item.onRun,
        );
      }
    }
    return handlers;
  }, [groupedItems]);

  useEffect(() => {
    if (!open) return;

    let sequence = "";
    let timeout: ReturnType<typeof setTimeout> | undefined;

    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        event.key === "Shift"
      ) {
        return;
      }

      if (event.key.length !== 1 && event.key !== "?") {
        return;
      }

      sequence = `${sequence}${event.key.toLowerCase()}`.slice(-3);
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        sequence = "";
      }, 700);

      const handler = shortcutHandlers.get(sequence);
      if (!handler) return;

      event.preventDefault();
      runCommand(handler);
      sequence = "";
      clearTimeout(timeout);
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      clearTimeout(timeout);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, shortcutHandlers, runCommand]);

  return (
    <>
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandDialogPopup instant>
          <Command items={groupedItems}>
            <CommandInput
              placeholder={t("navigation:commandPalette.inputPlaceholder")}
            />
            <CommandPanel>
              <CommandEmpty>
                {t("navigation:commandPalette.empty")}
              </CommandEmpty>
              <CommandList>
                {(group: PaletteGroup, groupIndex: number) => (
                  <Fragment key={group.value}>
                    <CommandGroup items={group.items}>
                      <CommandGroupLabel>{group.label}</CommandGroupLabel>
                      <CommandCollection>
                        {(item: PaletteActionItem) => {
                          return (
                            <CommandItem
                              key={item.value}
                              value={item.value}
                              onClick={() => runCommand(item.onRun)}
                              className="px-3"
                            >
                              <span className="flex-1">{item.label}</span>
                              {item.shortcut && (
                                <CommandShortcut>
                                  {item.shortcut}
                                </CommandShortcut>
                              )}
                            </CommandItem>
                          );
                        }}
                      </CommandCollection>
                    </CommandGroup>
                    {groupIndex < groupedItems.length - 1 && (
                      <CommandSeparator />
                    )}
                  </Fragment>
                )}
              </CommandList>
            </CommandPanel>
            <CommandFooter>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <KbdGroup>
                    <Kbd>
                      <ArrowUpIcon />
                    </Kbd>
                    <Kbd>
                      <ArrowDownIcon />
                    </Kbd>
                  </KbdGroup>
                  <span>{t("navigation:commandPalette.footer.navigate")}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Kbd>
                    <CornerDownLeftIcon />
                  </Kbd>
                  <span>{t("navigation:commandPalette.footer.open")}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Kbd>Esc</Kbd>
                <span>{t("navigation:commandPalette.footer.close")}</span>
              </div>
            </CommandFooter>
          </Command>
        </CommandDialogPopup>
      </CommandDialog>

      <SearchCommandMenu open={isSearchOpen} setOpen={setIsSearchOpen} />
      <CreateTaskModal
        open={isCreateTaskOpen}
        projectId={projectIdFromRoute}
        status={isBacklogView ? "planned" : undefined}
        // Igual que el boton de la cabecera: fuera de un proyecto la tarea
        // nace asignada a quien la crea, o no saldria en Hoy ni en el
        // Planificador.
        defaultAssigneeId={projectIdFromRoute ? undefined : session?.user?.id}
        onClose={() => setIsCreateTaskOpen(false)}
      />
      <StopDialog
        open={stopDialogOpen}
        onClose={() => setStopDialogOpen(false)}
        onConfirm={(endTime) => {
          stop(endTime);
          setStopDialogOpen(false);
        }}
        isPending={isStopping}
      />
      <CreateWorkspaceModal
        open={isCreateWorkspaceOpen}
        onClose={() => setIsCreateWorkspaceOpen(false)}
      />
      <CreateProjectModal
        open={isCreateProjectOpen}
        onClose={() => setIsCreateProjectOpen(false)}
      />
    </>
  );
}

export default CommandPalette;
