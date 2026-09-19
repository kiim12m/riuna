import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import ProjectLayout from "@/components/common/project-layout";
import { CyclePanel } from "@/components/cycle/cycle-panel";
import PageTitle from "@/components/page-title";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/workspace/$workspaceId/project/$projectId/cycles",
)({
  component: CyclesComponent,
});

function CyclesComponent() {
  const { t } = useTranslation();
  const { projectId, workspaceId } = Route.useParams();

  return (
    <>
      <PageTitle title={t("cycles:pageTitle")} />
      <ProjectLayout
        projectId={projectId}
        workspaceId={workspaceId}
        activeView="cycles"
      >
        <CyclePanel projectId={projectId} />
      </ProjectLayout>
    </>
  );
}
