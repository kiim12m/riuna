import {
  Activity,
  Building2,
  LayoutGrid,
  type LucideIcon,
  SlidersHorizontal,
  Users,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/components/providers/auth-provider/hooks/use-auth";
import useGetProjects from "@/hooks/queries/project/use-get-projects";
import useActiveWorkspace from "@/hooks/queries/workspace/use-active-workspace";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";

export type AdminNavItem = { title: string; url: string; icon: LucideIcon };

/**
 * Lo que configura el espacio, para el menu del avatar (antes un grupo de la
 * barra lateral, que se movio ahi para limpiarla). La puerta son
 * **capacidades**, no el rol: `isAdmin` compara con las cadenas `owner` y
 * `admin`, y dejaria fuera a un rol a medida que si tiene el permiso (ver
 * `use-workspace-permission`). Quien no administra nada recibe una lista
 * vacia, y el menu no enseña ni la etiqueta.
 */
export function useAdminNavItems(): AdminNavItem[] {
  const { t } = useTranslation();
  const { data: workspace } = useActiveWorkspace();
  const {
    canManageWorkspace,
    canManageProjects,
    canManageTeam,
    canInviteUsers,
  } = useWorkspacePermission();
  const { data: projects } = useGetProjects({
    workspaceId: workspace?.id ?? "",
  });
  const { user } = useAuth();

  if (!workspace) return [];

  const base = `/dashboard/workspace/${workspace.id}`;
  const items: AdminNavItem[] = [];

  if (canManageProjects()) {
    items.push({
      title: t("navigation:sidebar.projects"),
      url: `${base}/admin/projects`,
      icon: LayoutGrid,
    });
  }

  if (canManageTeam() || canInviteUsers()) {
    items.push({
      title: t("navigation:sidebar.membersAndTeams"),
      url: `${base}/admin/members`,
      icon: Users,
    });
  }

  if (canManageWorkspace()) {
    items.push({
      title: t("navigation:sidebar.workspaceAdmin"),
      url: `${base}/admin/workspace/general`,
      icon: Building2,
    });
  }

  // Sin ningun proyecto no hay ajustes de proyecto que enseñar, igual que la
  // pestaña de Ajustes se deshabilitaba sola.
  if (canManageProjects() && (projects?.length ?? 0) > 0) {
    items.push({
      title: t("navigation:sidebar.projectSettings"),
      url: `${base}/admin/project-settings`,
      icon: SlidersHorizontal,
    });
  }

  // El estado de la instancia es del admin de instancia (ADR 075), que no es
  // un rol del espacio sino de la cuenta.
  if (user?.role === "admin") {
    items.push({
      title: t("navigation:sidebar.instanceStatus"),
      url: `${base}/admin/instance`,
      icon: Activity,
    });
  }

  return items;
}
