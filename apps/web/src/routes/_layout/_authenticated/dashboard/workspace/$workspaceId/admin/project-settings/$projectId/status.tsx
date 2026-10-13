import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import PageTitle from "@/components/page-title";
import ProjectStatusForm from "@/components/project/project-status-form";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/workspace/$workspaceId/admin/project-settings/$projectId/status",
)({
  component: RouteComponent,
});

function RouteComponent() {
  const { t } = useTranslation();
  const { projectId, workspaceId } = Route.useParams();
  const { canUpdateProjects } = useWorkspacePermission();

  return (
    <>
      <PageTitle title={t("settings:projectStatus.pageTitle")} />
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="space-y-2">
          <h1 className="text-page">{t("settings:projectStatus.title")}</h1>
          <p className="text-muted-foreground">
            {t("settings:projectStatus.subtitle")}
          </p>
        </div>
        <ProjectStatusForm
          projectId={projectId}
          workspaceId={workspaceId}
          canEdit={canUpdateProjects()}
        />
      </div>
    </>
  );
}
