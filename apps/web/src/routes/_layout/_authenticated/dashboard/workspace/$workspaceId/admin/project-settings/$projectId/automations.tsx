import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { AutomationList } from "@/components/automation/automation-list";
import PageTitle from "@/components/page-title";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/workspace/$workspaceId/admin/project-settings/$projectId/automations",
)({
  component: RouteComponent,
});

/** Las automatizaciones del proyecto (Fase 8, ADR 066). */
function RouteComponent() {
  const { t } = useTranslation();
  const { projectId, workspaceId } = Route.useParams();
  const { canUpdateProjects } = useWorkspacePermission();

  return (
    <>
      <PageTitle title={t("settings:automations.projectPageTitle")} />
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="space-y-2">
          <h1 className="text-page">{t("settings:automations.title")}</h1>
          <p className="text-muted-foreground">
            {t("settings:automations.projectDescription")}
          </p>
        </div>

        <AutomationList
          scope="project"
          target={{ kind: "project", projectId }}
          workspaceId={workspaceId}
          projectId={projectId}
          canEdit={canUpdateProjects()}
        />
      </div>
    </>
  );
}
