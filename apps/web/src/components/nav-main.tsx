import { useNavigate, useRouterState } from "@tanstack/react-router";
import {
  CalendarCheck,
  CalendarClock,
  ChevronRight,
  Clock,
  FileClock,
  LayoutDashboard,
  ListTodo,
  type LucideIcon,
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
import { useTeamMembers } from "@/hooks/queries/lead/use-team";
import { useMyWorkCounts } from "@/hooks/queries/my-work/use-my-work-counts";
import useActiveWorkspace from "@/hooks/queries/workspace/use-active-workspace";

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
}: {
  label: string;
  items: NavItem[];
  pathname: string;
}) {
  const navigate = useNavigate();

  if (items.length === 0) return null;

  return (
    <Collapsible defaultOpen className="group/collapsible">
      <SidebarGroup className="gap-1 p-2">
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

  const { data: counts } = useMyWorkCounts(workspace?.id ?? "");
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
    // «Objetivos» salio de la barra para limpiarla (ADR 061): por ahora no se
    // usa. La pagina sigue en `…/goals`, en la paleta y en el widget de
    // objetivo de «Mi panel».
  ];

  // La administracion del espacio ya no va aqui: esta en el menu del avatar,
  // debajo de «Ajustes» (`useAdminNavItems`), para limpiar la barra.
  return (
    <NavGroup
      label={t("navigation:sidebar.personal")}
      items={personal}
      pathname={pathname}
    />
  );
}
