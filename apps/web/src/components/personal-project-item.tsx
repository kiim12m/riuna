import { useNavigate, useRouterState } from "@tanstack/react-router";
import { UserRound } from "lucide-react";
import { useTranslation } from "react-i18next";
import { SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import { useInbox } from "@/hooks/queries/capture/use-inbox";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";

/**
 * «Personal», en lo alto de «Proyectos» (ADR 051): el proyecto de cada
 * persona donde cae la captura sin proyecto. La API lo deja fuera de la lista
 * de proyectos -no sale en la de los demas, ni en selectores ni en la
 * administracion-, asi que la barra lo pinta aparte, fijo y sin arrastre.
 *
 * Se crea al primer uso: sin el todavia, la entrada pasa por `/inbox`, que lo
 * crea, y solo la ve quien puede crear tareas. Ya creado, va directa a su
 * tablero -`/inbox` pide crearlo, y eso exige crear tareas-.
 */
export function PersonalProjectItem({ workspaceId }: { workspaceId: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { canCreateTasks } = useWorkspacePermission();
  const { data: personal } = useInbox(workspaceId);
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });

  if (!personal && !canCreateTasks()) return null;

  const base = `/dashboard/workspace/${workspaceId}`;
  const url = personal
    ? `${base}/project/${personal.id}/board`
    : `${base}/inbox`;
  const isActive = personal
    ? pathname.startsWith(`${base}/project/${personal.id}`)
    : pathname === url;
  const label = t("navigation:sidebar.inbox");

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        tooltip={label}
        isActive={isActive}
        size="default"
        className="h-8 ps-2 text-sm hover:bg-sidebar-accent/60 group-data-[collapsible=icon]:justify-center"
        onClick={() => navigate({ to: url })}
      >
        <span
          aria-hidden="true"
          className="flex size-5 shrink-0 items-center justify-center rounded-[4px] bg-sidebar-accent text-sidebar-accent-foreground"
        >
          <UserRound className="size-3.5" />
        </span>
        <span className="group-data-[collapsible=icon]:hidden">{label}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
