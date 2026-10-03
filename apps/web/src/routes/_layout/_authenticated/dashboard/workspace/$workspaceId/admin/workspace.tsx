import {
  createFileRoute,
  Link,
  Outlet,
  useLocation,
} from "@tanstack/react-router";
import {
  CalendarOff,
  CreditCard,
  Settings,
  Shield,
  Tag,
  Users,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import WorkspaceLayout from "@/components/common/workspace-layout";
import PageTitle from "@/components/page-title";
import SettingsSidebar from "@/components/SettingsSidebar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import useGetConfig from "@/hooks/queries/config/use-get-config";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { cn } from "@/lib/cn";
import { getInitials } from "@/lib/get-initials";

/**
 * Los ajustes del espacio, ya dentro de `/dashboard/workspace/$workspaceId`.
 *
 * Al mudarse aqui desapareció el `beforeLoad` que elegía un espacio activo a
 * mano: existía porque la pantalla de Ajustes vivía fuera de la ruta con
 * parámetro y no tenía forma de saber "cuál", así que dependía de la
 * organización activa de la sesión y se quedaba en blanco al entrar por enlace
 * directo. Ahora el espacio es el de la URL y `useActiveWorkspace` ya lo
 * prefiere sobre el de la sesión.
 */
export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/workspace/$workspaceId/admin/workspace",
)({
  component: RouteComponent,
});

function RouteComponent() {
  const { t } = useTranslation();
  const { workspaceId } = Route.useParams();
  const { workspace, role } = useWorkspacePermission();
  const { data: config } = useGetConfig();
  const location = useLocation();

  const base = `/dashboard/workspace/${workspaceId}/admin/workspace`;

  const menuItems = [
    {
      title: t("settings:workspaceGeneral.title"),
      url: `${base}/general`,
      icon: Settings,
    },
    {
      title: t("settings:workspaceRoles.title", { defaultValue: "Roles" }),
      url: `${base}/roles`,
      icon: Shield,
    },
    {
      title: t("settings:workspaceTeams.title", { defaultValue: "Teams" }),
      url: `${base}/teams`,
      icon: Users,
    },
    {
      title: t("settings:workspaceLabels.title", { defaultValue: "Labels" }),
      url: `${base}/labels`,
      icon: Tag,
    },
    {
      title: t("availability:holidays.title"),
      url: `${base}/holidays`,
      icon: CalendarOff,
    },
    ...(config?.billingEnabled
      ? [
          {
            title: "Billing",
            url: `${base}/billing`,
            icon: CreditCard,
          },
        ]
      : []),
  ];
  const isActivePath = (path: string) => location.pathname === path;
  const workspaceInitials = getInitials(workspace?.name, "WS");

  return (
    <>
      <PageTitle title={t("navigation:sidebar.workspaceAdmin")} />
      <WorkspaceLayout title={t("navigation:sidebar.workspaceAdmin")}>
        <div className="flex h-full gap-6 p-4">
          <SettingsSidebar>
            <div className="p-2">
              <div className="mb-1 flex items-center gap-3 rounded-md px-2 py-2">
                <Avatar className="h-8 w-8">
                  <AvatarImage
                    src={workspace?.logo ?? ""}
                    alt={workspace?.name || ""}
                  />
                  <AvatarFallback className="border border-sidebar-border/70 bg-sidebar-accent/70 text-xs font-medium text-sidebar-accent-foreground">
                    {workspaceInitials}
                  </AvatarFallback>
                </Avatar>
                <div className="flex min-w-0 flex-col md:min-w-fit">
                  <p className="truncate text-sm md:overflow-visible md:text-clip md:whitespace-normal">
                    {workspace?.name}
                  </p>
                  <p className="truncate text-xs text-sidebar-foreground/60 capitalize md:overflow-visible md:text-clip md:whitespace-normal">
                    {t(`team:roles.${role}`, { defaultValue: role })}
                  </p>
                </div>
              </div>

              <SidebarGroup className="gap-1 p-1">
                <SidebarGroupLabel className="h-7 px-2 text-xs uppercase tracking-wide text-sidebar-foreground/70">
                  {t("navigation:page.settingsWorkspaceTab")}
                </SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu className="gap-0.5">
                    {menuItems.map((item) => (
                      <SidebarMenuItem key={item.title}>
                        <Button
                          render={<Link to={item.url} />}
                          variant="ghost"
                          size="sm"
                          className={cn(
                            "h-8 w-full justify-start gap-2 rounded-lg px-2 text-sm font-normal text-sidebar-foreground/80",
                            isActivePath(item.url) &&
                              "bg-sidebar-accent text-sidebar-accent-foreground",
                          )}
                        >
                          <item.icon className="h-4 w-4" />
                          <span>{item.title}</span>
                        </Button>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            </div>
          </SettingsSidebar>

          <div className="min-w-0 flex-1 overflow-y-auto">
            <Outlet />
          </div>
        </div>
      </WorkspaceLayout>
    </>
  );
}
