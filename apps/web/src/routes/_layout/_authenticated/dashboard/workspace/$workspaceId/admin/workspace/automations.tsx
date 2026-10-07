import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { AutomationList } from "@/components/automation/automation-list";
import PageTitle from "@/components/page-title";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/workspace/$workspaceId/admin/workspace/automations",
)({
  component: RouteComponent,
});

/**
 * Las reglas de espacio (ADR 066): actuan en todos los proyectos menos los
 * «Personal», y piden `workspace:manage_settings`.
 */
function RouteComponent() {
  const { t } = useTranslation();
  const { workspaceId } = Route.useParams();
  const { canManageSettings } = useWorkspacePermission();

  return (
    <>
      <PageTitle title={t("settings:automations.workspacePageTitle")} />
      <div className="space-y-6">
        <div className="space-y-2">
          <h1 className="text-page">{t("settings:automations.title")}</h1>
          <p className="text-muted-foreground">
            {t("settings:automations.workspaceDescription")}
          </p>
        </div>
        <AutomationList
          scope="workspace"
          target={{ kind: "workspace", workspaceId }}
          workspaceId={workspaceId}
          projectId={null}
          canEdit={canManageSettings()}
        />
      </div>
    </>
  );
}
