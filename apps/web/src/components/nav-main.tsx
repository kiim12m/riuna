import { useNavigate } from "@tanstack/react-router";
import {
  ChevronRight,
  LayoutDashboard,
  LayoutGrid,
  Mail,
  Target,
  Users,
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
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { usePendingInvitations } from "@/hooks/queries/invitation/use-pending-invitations";
import useActiveWorkspace from "@/hooks/queries/workspace/use-active-workspace";

export function NavMain() {
  const { t } = useTranslation();
  const { data: workspace } = useActiveWorkspace();
  const navigate = useNavigate();
  const { data: invitations = [] } = usePendingInvitations();

  if (!workspace) return null;

  const pendingCount = invitations.length;

  const navItems = [
    {
      // Primera de la lista: es la pantalla que responde "que me toca hoy", y
      // la unica que reune el trabajo de todos los proyectos. Sin badge a
      // proposito: la campana ya lleva ese numero y dos insignias para lo
      // mismo en la misma pantalla sobran.
      title: t("navigation:sidebar.home"),
      url: `/dashboard/workspace/${workspace.id}/home`,
      icon: LayoutDashboard,
      isActive:
        window.location.pathname ===
        `/dashboard/workspace/${workspace.id}/home`,
      badge: null,
    },
    {
      // Objetivos es una superficie de gestion, no una respuesta a "que me toca
      // hoy": por eso tiene entrada propia y no se funde con el panel, al reves
      // que "Mi trabajo" (ADR 031).
      title: t("navigation:sidebar.goals"),
      url: `/dashboard/workspace/${workspace.id}/goals`,
      icon: Target,
      isActive:
        window.location.pathname ===
        `/dashboard/workspace/${workspace.id}/goals`,
      badge: null,
    },
    {
      title: t("navigation:sidebar.projects"),
      url: `/dashboard/workspace/${workspace.id}`,
      icon: LayoutGrid,
      isActive:
        window.location.pathname === `/dashboard/workspace/${workspace.id}`,
      badge: null,
    },
    {
      title: t("navigation:sidebar.members"),
      url: `/dashboard/workspace/${workspace.id}/members`,
      icon: Users,
      isActive:
        window.location.pathname ===
        `/dashboard/workspace/${workspace.id}/members`,
      badge: null,
    },
    {
      title: t("navigation:sidebar.invitations"),
      url: "/dashboard/invitations",
      icon: Mail,
      isActive: window.location.pathname === "/dashboard/invitations",
      badge: pendingCount > 0 ? pendingCount : null,
    },
  ];

  return (
    <Collapsible defaultOpen className="group/collapsible">
      <SidebarGroup className="gap-1 p-2">
        <CollapsibleTrigger
          className="data-panel-open:[&_svg]:rotate-90"
          render={
            <SidebarGroupLabel className="h-7 cursor-pointer justify-between px-0 text-sidebar-accent-foreground" />
          }
        >
          <span>{t("navigation:sidebar.overview")}</span>
          <ChevronRight className="h-3.5 w-3.5 text-sidebar-foreground/60 transition-transform duration-200" />
        </CollapsibleTrigger>
        <CollapsiblePanel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5">
              {navItems.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton
                    tooltip={item.title}
                    isActive={item.isActive}
                    size="default"
                    className="h-8 ps-2 text-sm hover:bg-sidebar-accent/60 group-data-[collapsible=icon]:justify-center"
                    onClick={() => navigate({ to: item.url })}
                  >
                    <item.icon className="text-sidebar-foreground/70" />
                    <span className="group-data-[collapsible=icon]:hidden">
                      {item.title}
                    </span>
                    {item.badge !== null && (
                      <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-sm border border-sidebar-border/60 px-1 text-[11px] font-medium text-sidebar-foreground/80 group-data-[collapsible=icon]:hidden">
                        {item.badge}
                      </span>
                    )}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </CollapsiblePanel>
      </SidebarGroup>
    </Collapsible>
  );
}
