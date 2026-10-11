import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import WorkspaceLayout from "@/components/common/workspace-layout";
import InstanceStatus from "@/components/instance/instance-status";
import PageTitle from "@/components/page-title";
import { useAuth } from "@/components/providers/auth-provider/hooks/use-auth";
import { useInstanceReport } from "@/hooks/queries/instance/use-instance-report";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/workspace/$workspaceId/admin/instance",
)({
  component: RouteComponent,
});

// El estado es de la instancia, no del espacio: cuelga de la administración
// del espacio porque es donde el admin de instancia ya administra cuentas. La
// guarda de verdad está en la API (`assertInstanceAdmin`).
function RouteComponent() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isInstanceAdmin = user?.role === "admin";
  const { data, isLoading, isError } = useInstanceReport(isInstanceAdmin);

  return (
    <>
      <PageTitle title={t("settings:instance.pageTitle")} />
      <WorkspaceLayout title={t("settings:instance.pageTitle")}>
        <div className="p-4">
          <InstanceStatus
            report={data}
            isLoading={isInstanceAdmin && isLoading}
            isError={isError || !isInstanceAdmin}
          />
        </div>
      </WorkspaceLayout>
    </>
  );
}
