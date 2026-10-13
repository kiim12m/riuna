import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { AnnouncementBoard } from "@/components/announcement/announcement-board";
import ProjectLayout from "@/components/common/project-layout";
import PageTitle from "@/components/page-title";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/workspace/$workspaceId/project/$projectId/announcements",
)({
  component: ProjectAnnouncements,
});

function ProjectAnnouncements() {
  const { t } = useTranslation();
  const { projectId, workspaceId } = Route.useParams();
  const { canUpdateProjects } = useWorkspacePermission();

  return (
    <>
      <PageTitle title={t("announcements:projectTitle")} />
      <ProjectLayout
        projectId={projectId}
        workspaceId={workspaceId}
        activeView="announcements"
      >
        <div className="h-full overflow-y-auto">
          <AnnouncementBoard
            workspaceId={workspaceId}
            scope={{ kind: "project", projectId }}
            canPublish={canUpdateProjects()}
          />
        </div>
      </ProjectLayout>
    </>
  );
}
