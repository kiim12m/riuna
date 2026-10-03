import { useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Building2,
  CalendarCheck,
  CalendarClock,
  ChevronRight,
  Clock,
  FileClock,
  Inbox,
  LayoutDashboard,
  LayoutGrid,
  ListTodo,
  type LucideIcon,
  SlidersHorizontal,
  Target,
  Users,
  UsersRound,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  Collapsible,
  CollapsiblePanel,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { useInbox } from "@/hooks/queries/capture/use-inbox";
import { useTeamMembers } from "@/hooks/queries/lead/use-team";
import { useMyWorkCounts } from "@/hooks/queries/my-work/use-my-work-counts";
import useGetProjects from "@/hooks/queries/project/use-get-projects";
import useActiveWorkspace from "@/hooks/queries/workspace/use-active-workspace";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { cn } from "@/lib/cn";

type NavItem = {
  title: string;
  url: string;
  icon: LucideIcon;
  /**
   * Prefijo con el que se decide si la entrada esta activa, cuando no basta
   * con que la ruta coincida con `url`. Una seccion con sub-paginas apunta a
   * la primera —para no encadenar una redireccion en cada clic— pero tiene que
   * seguir marcada estando en cualquiera de las otras.
   */
  activePrefix?: string;
  /** El numero de la maqueta junto a "Hoy" y "Mis tareas" (ADR 046). Oculto en raíl. */
  count?: number;
};

function NavGroup({
  label,
  items,
  pathname,
  separated,
}: {
  label: string;
  items: NavItem[];
  pathname: string;
  /**
   * En rail los rotulos de grupo se ocultan y los tres bloques quedarian
   * separados solo por aire. El filete devuelve la agrupacion, que es lo que
   * este cambio venia a dar.
   */
  separated?: boolean;
}) {
  const navigate = useNavigate();

  if (items.length === 0) return null;

  return (
    <Collapsible defaultOpen className="group/collapsible">
      <SidebarGroup
        className={cn(
          "gap-1 p-2",
          separated &&
            "group-data-[collapsible=icon]:mt-1 group-data-[collapsible=icon]:border-sidebar-border group-data-[collapsible=icon]:border-t group-data-[collapsible=icon]:pt-2",
        )}
      >
        <CollapsibleTrigger
          className="data-panel-open:[&_svg]:rotate-90"
          render={
            <SidebarGroupLabel className="h-7 cursor-pointer justify-between px-0 text-label text-sidebar-accent-foreground uppercase" />
          }
        >
          <span>{label}</span>
          <ChevronRight className="h-3.5 w-3.5 text-sidebar-foreground/60 transition-transform duration-200" />
        </CollapsibleTrigger>
        <CollapsiblePanel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5">
              {items.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton
                    tooltip={item.title}
                    isActive={
                      item.activePrefix
                        ? pathname.startsWith(item.activePrefix)
                        : pathname === item.url
                    }
                    size="default"
                    className="h-8 ps-2 text-sm hover:bg-sidebar-accent/60 group-data-[collapsible=icon]:justify-center"
                    onClick={() => navigate({ to: item.url })}
                  >
                    <item.icon className="text-sidebar-foreground/70" />
                    <span className="group-data-[collapsible=icon]:hidden">
                      {item.title}
                    </span>
                  </SidebarMenuButton>
                  {Boolean(item.count) && (
                    <SidebarMenuBadge className="font-normal opacity-75">
                      {item.count}
                    </SidebarMenuBadge>
                  )}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </CollapsiblePanel>
      </SidebarGroup>
    </Collapsible>
  );
}

export function NavMain() {
  const { t } = useTranslation();
  const { data: workspace } = useActiveWorkspace();

  // `useRouterState` y no `window.location.pathname`: lo segundo no es
  // reactivo, asi que el estado activo no se repintaba al navegar dentro de
  // la SPA salvo que algo mas forzara el render.
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });

  const {
    canManageWorkspace,
    canManageProjects,
    canManageTeam,
    canInviteUsers,
    canCreateTasks,
  } = useWorkspacePermission();

  const { data: projects } = useGetProjects({
    workspaceId: workspace?.id ?? "",
  });
  const { data: counts } = useMyWorkCounts(workspace?.id ?? "");
  const { data: inbox } = useInbox(workspace?.id ?? "");
  // «Mi equipo» solo para quien lleva a alguien (ADR 059).
  const { data: ledMembers } = useTeamMembers(workspace?.id ?? "");

  if (!workspace) return null;

  const base = `/dashboard/workspace/${workspace.id}`;

  // Lo que responde "que me toca a mi". Lo ve todo el mundo. "Mi panel" va
  // primero: es la vista que resume el resto, y por eso es tambien la pantalla
  // de inicio del espacio personal.
  const personal: NavItem[] = [
    {
      title: t("navigation:sidebar.home"),
      url: `${base}/home`,
      icon: LayoutDashboard,
    },
    {
      title: t("navigation:sidebar.today"),
      url: `${base}/today`,
      icon: CalendarCheck,
      count: counts?.today,
    },
    // La Bandeja es un proyecto oculto en las listas (ADR 051): se llega a
    // ella por aqui. `/inbox` la crea al primer uso y lleva a su lista, asi
    // que la entrada se marca estando en el proyecto, no en esa puerta. Ya
    // creada, va directa: `/inbox` pide crearla, y eso exige crear tareas
    // -a quien paso a lector le daba un 403-.
    ...(inbox || canCreateTasks()
      ? [
          {
            title: t("navigation:sidebar.inbox"),
            url: inbox ? `${base}/project/${inbox.id}/board` : `${base}/inbox`,
            icon: Inbox,
            activePrefix: inbox ? `${base}/project/${inbox.id}` : undefined,
          },
        ]
      : []),
    {
      title: t("navigation:sidebar.planner"),
      url: `${base}/planner`,
      icon: CalendarClock,
    },
    {
      title: t("navigation:sidebar.schedule"),
      url: `${base}/schedule`,
      icon: Clock,
    },
    {
      title: t("navigation:sidebar.myTasks"),
      url: `${base}/my-tasks`,
      icon: ListTodo,
      activePrefix: `${base}/my-tasks`,
      count: counts?.myTasks,
    },
    ...(ledMembers && ledMembers.length > 0
      ? [
          {
            title: t("navigation:sidebar.team"),
            url: `${base}/team`,
            icon: UsersRound,
          },
        ]
      : []),
    {
      title: t("navigation:sidebar.timeSheet"),
      url: `${base}/time-sheet`,
      icon: FileClock,
    },
    {
      title: t("navigation:sidebar.goals"),
      url: `${base}/goals`,
      icon: Target,
    },
  ];

  // Lo que configura el espacio. La puerta son **capacidades**, no el rol:
  // `isAdmin` compara con las cadenas `owner` y `admin`, y dejaria fuera a un
  // rol a medida que si tiene el permiso (ver `use-workspace-permission`).
  const admin: NavItem[] = [];

  if (canManageProjects()) {
    admin.push({
      title: t("navigation:sidebar.projects"),
      url: `${base}/admin/projects`,
      icon: LayoutGrid,
    });
  }

  if (canManageTeam() || canInviteUsers()) {
    admin.push({
      title: t("navigation:sidebar.membersAndTeams"),
      url: `${base}/admin/members`,
      icon: Users,
    });
  }

  if (canManageWorkspace()) {
    admin.push({
      title: t("navigation:sidebar.workspaceAdmin"),
      url: `${base}/admin/workspace/general`,
      icon: Building2,
      activePrefix: `${base}/admin/workspace`,
    });
  }

  // Sin ningun proyecto no hay ajustes de proyecto que ensenar, igual que la
  // pestana de Ajustes se deshabilitaba sola.
  if (canManageProjects() && (projects?.length ?? 0) > 0) {
    admin.push({
      title: t("navigation:sidebar.projectSettings"),
      url: `${base}/admin/project-settings`,
      icon: SlidersHorizontal,
      activePrefix: `${base}/admin/project-settings`,
    });
  }

  return (
    <>
      <NavGroup
        label={t("navigation:sidebar.personal")}
        items={personal}
        pathname={pathname}
      />
      <NavGroup
        label={t("navigation:sidebar.admin")}
        items={admin}
        pathname={pathname}
        separated
      />
    </>
  );
}
