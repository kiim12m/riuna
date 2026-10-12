import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { AnnouncementBoard } from "@/components/announcement/announcement-board";
import WorkspaceLayout from "@/components/common/workspace-layout";
import PageTitle from "@/components/page-title";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/workspace/$workspaceId/announcements",
)({
  component: WorkspaceAnnouncements,
});

function WorkspaceAnnouncements() {
  const { t } = useTranslation();
  const { workspaceId } = Route.useParams();
  const { canManageSettings } = useWorkspacePermission();

  return (
    <>
      <PageTitle title={t("announcements:workspaceTitle")} />
      <WorkspaceLayout title={t("announcements:workspaceTitle")}>
        <AnnouncementBoard
          workspaceId={workspaceId}
          scope={{ kind: "workspace", workspaceId }}
          canPublish={canManageSettings()}
        />
      </WorkspaceLayout>
    </>
  );
}
