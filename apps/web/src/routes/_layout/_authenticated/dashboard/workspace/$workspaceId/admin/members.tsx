import { createFileRoute } from "@tanstack/react-router";
import { UserPlus, UserRoundCog } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import WorkspaceLayout from "@/components/common/workspace-layout";
import PageTitle from "@/components/page-title";
import { useAuth } from "@/components/providers/auth-provider/hooks/use-auth";
import CreateLocalUserModal from "@/components/team/create-local-user-modal";
import InviteTeamMemberModal from "@/components/team/invite-team-member-modal";
import MembersTable from "@/components/team/members-table";
import { Button } from "@/components/ui/button";
import useGetFullWorkspace from "@/hooks/queries/workspace/use-get-full-workspace";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/workspace/$workspaceId/admin/members",
)({
  component: RouteComponent,
});

function RouteComponent() {
  const { t } = useTranslation();
  const { workspaceId } = Route.useParams();
  const { data: workspace } = useGetFullWorkspace({ workspaceId });
  const { canInviteUsers } = useWorkspacePermission();
  const canInvite = Boolean(canInviteUsers());
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [isLocalUserOpen, setIsLocalUserOpen] = useState(false);
  const { user } = useAuth();
  // Crear una cuenta da acceso al servidor entero, no solo a este espacio: la
  // guarda real esta en el endpoint, esto solo evita ensenar un boton inutil.
  const isInstanceAdmin = user?.role === "admin";

  return (
    <>
      <PageTitle title={t("team:members.pageTitle")} />
      <WorkspaceLayout
        title={t("team:members.pageTitle")}
        headerActions={
          <div className="flex items-center gap-1.5">
            {isInstanceAdmin ? (
              <Button
                variant="outline"
                size="xs"
                onClick={() => setIsLocalUserOpen(true)}
                className="gap-1"
              >
                <UserRoundCog className="w-3 h-3" />
                {t("team:members.createLocalUser")}
              </Button>
            ) : null}
            {canInvite ? (
              <Button
                variant="outline"
                size="xs"
                onClick={() => setIsInviteOpen(true)}
                className="gap-1"
              >
                <UserPlus className="w-3 h-3" />
                {t("team:members.inviteMember")}
              </Button>
            ) : null}
          </div>
        }
      >
        <MembersTable
          workspaceId={workspaceId}
          users={workspace?.members ?? []}
          invitations={workspace?.invitations ?? []}
        />

        <InviteTeamMemberModal
          open={isInviteOpen}
          onClose={() => setIsInviteOpen(false)}
        />

        <CreateLocalUserModal
          open={isLocalUserOpen}
          onClose={() => setIsLocalUserOpen(false)}
        />
      </WorkspaceLayout>
    </>
  );
}
