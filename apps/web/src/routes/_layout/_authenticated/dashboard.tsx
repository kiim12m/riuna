import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import PageTitle from "@/components/page-title";
import { WorkspaceRuntime } from "@/components/workspace-runtime";
import useActiveWorkspace from "@/hooks/queries/workspace/use-active-workspace";
import { usePendingCheckout } from "@/hooks/use-pending-checkout";
import { usePreferencesSync } from "@/hooks/use-preferences-sync";

export const Route = createFileRoute("/_layout/_authenticated/dashboard")({
  component: DashboardLayoutComponent,
});

function DashboardLayoutComponent() {
  const { t } = useTranslation();
  const { data: workspace } = useActiveWorkspace();
  usePendingCheckout();
  usePreferencesSync();

  return (
    <>
      <PageTitle
        title={t("navigation:page.projectsTitle")}
        hideAppName={!workspace?.name}
      />
      {/* Aqui y no en la barra lateral: esta ruta no se desmonta al navegar
          entre pantallas, y cubre tambien los ajustes de cuenta (ADR 048). */}
      <WorkspaceRuntime />
      <Outlet />
    </>
  );
}
