import { createFileRoute } from "@tanstack/react-router";
import { Pencil, Plus, Trash2, UserMinus, Users } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import PageTitle from "@/components/page-title";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardDescription,
  CardFrame,
  CardHeader,
  CardPanel,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useSetTeamLead } from "@/hooks/mutations/lead/use-set-team-lead";
import { useAddTeamMember } from "@/hooks/mutations/team/use-add-team-member";
import { useCreateTeam } from "@/hooks/mutations/team/use-create-team";
import { useRemoveTeam } from "@/hooks/mutations/team/use-remove-team";
import { useRemoveTeamMember } from "@/hooks/mutations/team/use-remove-team-member";
import { useUpdateTeam } from "@/hooks/mutations/team/use-update-team";
import { useTeamLeads } from "@/hooks/queries/lead/use-leads";
import useGetTeamMembers from "@/hooks/queries/team/use-get-team-members";
import useGetTeams from "@/hooks/queries/team/use-get-teams";
import useGetWorkspaceUsers from "@/hooks/queries/workspace-users/use-get-workspace-users";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { getInitials } from "@/lib/get-initials";
import { toast } from "@/lib/toast";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/workspace/$workspaceId/admin/workspace/teams",
)({
  component: RouteComponent,
});

type TeamSummary = { id: string; name: string };

function RouteComponent() {
  const { t } = useTranslation();
  const { workspace, canManageTeam } = useWorkspacePermission();
  const canManage = canManageTeam();
  const workspaceId = workspace?.id ?? "";

  const { data: teams } = useGetTeams({ workspaceId });
  const createTeam = useCreateTeam();
  const updateTeam = useUpdateTeam();
  const removeTeam = useRemoveTeam();

  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [editing, setEditing] = useState<TeamSummary | null>(null);
  const [editName, setEditName] = useState("");
  const [deleting, setDeleting] = useState<TeamSummary | null>(null);
  const [managing, setManaging] = useState<TeamSummary | null>(null);

  const teamList: TeamSummary[] = (teams ?? []).map((team) => ({
    id: team.id,
    name: team.name,
  }));

  const handleCreate = async () => {
    const name = createName.trim();
    if (!name) return;

    try {
      await createTeam.mutateAsync({ name, workspaceId });
      toast.success(
        t("settings:workspaceTeams.createSuccess", {
          defaultValue: "Team created",
        }),
      );
      setCreateOpen(false);
      setCreateName("");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("settings:workspaceTeams.createError", {
              defaultValue: "Failed to create team",
            }),
      );
    }
  };

  const handleEdit = async () => {
    if (!editing) return;
    const name = editName.trim();
    if (!name) return;

    try {
      await updateTeam.mutateAsync({ teamId: editing.id, name, workspaceId });
      toast.success(
        t("settings:workspaceTeams.updateSuccess", {
          defaultValue: "Team updated",
        }),
      );
      setEditing(null);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("settings:workspaceTeams.updateError", {
              defaultValue: "Failed to update team",
            }),
      );
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;

    try {
      await removeTeam.mutateAsync({ teamId: deleting.id, workspaceId });
      toast.success(
        t("settings:workspaceTeams.deleteSuccess", {
          defaultValue: "Team deleted",
        }),
      );
      setDeleting(null);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("settings:workspaceTeams.deleteError", {
              defaultValue: "Failed to delete team",
            }),
      );
    }
  };

  return (
    <>
      <PageTitle
        title={t("settings:workspaceTeams.title", { defaultValue: "Teams" })}
      />
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="space-y-2">
          <h1 className="text-page">
            {t("settings:workspaceTeams.title", { defaultValue: "Teams" })}
          </h1>
          <p className="text-muted-foreground">
            {t("settings:workspaceTeams.subtitle", {
              defaultValue:
                "Group people into departments and assign whole teams to tasks.",
            })}
          </p>
        </div>

        <CardFrame>
          <Card className="!rounded-none !border-t-0">
            <CardHeader>
              <CardTitle className="inline-flex items-center gap-2 text-base">
                <Users className="size-4" />
                {t("settings:workspaceTeams.title", { defaultValue: "Teams" })}
              </CardTitle>
              <CardDescription>
                {t("settings:workspaceTeams.cardDescription", {
                  defaultValue:
                    "A task can be assigned to a team as well as to a person.",
                })}
              </CardDescription>
              {canManage && (
                <CardAction>
                  <Button
                    onClick={() => {
                      setCreateName("");
                      setCreateOpen(true);
                    }}
                    className="gap-2"
                  >
                    <Plus className="size-4" />
                    {t("settings:workspaceTeams.createTeam", {
                      defaultValue: "Create Team",
                    })}
                  </Button>
                </CardAction>
              )}
            </CardHeader>
          </Card>

          <Card className="!rounded-none">
            <CardPanel className="p-4">
              {teamList.length === 0 ? (
                <Empty>
                  <EmptyHeader>
                    <EmptyMedia>
                      <Users className="size-8 text-muted-foreground" />
                    </EmptyMedia>
                    <EmptyTitle>
                      {t("settings:workspaceTeams.empty", {
                        defaultValue:
                          "No teams yet. Create one to start assigning work to a whole department.",
                      })}
                    </EmptyTitle>
                    <EmptyDescription />
                  </EmptyHeader>
                </Empty>
              ) : (
                <div className="divide-y divide-border">
                  {teamList.map((team) => (
                    <div
                      key={team.id}
                      className="flex items-center justify-between py-2.5 px-1"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Users className="size-4 text-muted-foreground shrink-0" />
                        <span className="text-sm truncate">{team.name}</span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8"
                          onClick={() => setManaging(team)}
                        >
                          {t("settings:workspaceTeams.manageMembers", {
                            defaultValue: "Members",
                          })}
                        </Button>
                        {canManage && (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              aria-label={t("settings:workspaceTeams.rename", {
                                defaultValue: "Rename team",
                              })}
                              onClick={() => {
                                setEditing(team);
                                setEditName(team.name);
                              }}
                            >
                              <Pencil className="size-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              aria-label={t("settings:workspaceTeams.delete", {
                                defaultValue: "Delete team",
                              })}
                              onClick={() => setDeleting(team)}
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardPanel>
          </Card>
        </CardFrame>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t("settings:workspaceTeams.createTeam", {
                defaultValue: "Create Team",
              })}
            </DialogTitle>
            <DialogDescription>
              {t("settings:workspaceTeams.createDescription", {
                defaultValue: "Name the department or group.",
              })}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="team-name">
              {t("settings:workspaceTeams.name", { defaultValue: "Name" })}
            </Label>
            <Input
              id="team-name"
              value={createName}
              onChange={(event) => setCreateName(event.target.value)}
              placeholder={t("settings:workspaceTeams.namePlaceholder", {
                defaultValue: "Design",
              })}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              {t("common:actions.cancel")}
            </Button>
            <Button onClick={handleCreate} disabled={!createName.trim()}>
              {t("settings:workspaceTeams.createTeam", {
                defaultValue: "Create Team",
              })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(editing)}
        onOpenChange={(open) => !open && setEditing(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t("settings:workspaceTeams.rename", {
                defaultValue: "Rename team",
              })}
            </DialogTitle>
            <DialogDescription />
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="team-edit-name">
              {t("settings:workspaceTeams.name", { defaultValue: "Name" })}
            </Label>
            <Input
              id="team-edit-name"
              value={editName}
              onChange={(event) => setEditName(event.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              {t("common:actions.cancel")}
            </Button>
            <Button onClick={handleEdit} disabled={!editName.trim()}>
              {t("settings:workspaceTeams.save", { defaultValue: "Save" })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("settings:workspaceTeams.deleteTitle", {
                defaultValue: "Delete team?",
              })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("settings:workspaceTeams.deleteDescription", {
                defaultValue:
                  "Tasks assigned to this team keep their individual assignee but lose the team.",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)}>
              {t("common:actions.cancel")}
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              {t("common:actions.delete")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <TeamMembersDialog
        team={managing}
        workspaceId={workspaceId}
        canManage={canManage}
        onClose={() => setManaging(null)}
      />
    </>
  );
}

function TeamMembersDialog({
  team,
  workspaceId,
  canManage,
  onClose,
}: {
  team: TeamSummary | null;
  workspaceId: string;
  canManage: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { data: members } = useGetTeamMembers({ teamId: team?.id });
  const { data: workspaceUsers } = useGetWorkspaceUsers({ workspaceId });
  const addMember = useAddTeamMember();
  const removeMember = useRemoveTeamMember();
  // El responsable de departamento (ADR 059): lee el plan y los cierres del
  // resto del equipo, nunca su valoracion.
  const { data: leads } = useTeamLeads(workspaceId);
  const setLead = useSetTeamLead(workspaceId);
  const leadIds = new Set(
    (leads ?? [])
      .filter((lead) => lead.teamId === team?.id)
      .map((lead) => lead.userId),
  );

  const memberUserIds = new Set((members ?? []).map((member) => member.userId));
  const candidates = (workspaceUsers ?? []).filter(
    (member) => !memberUserIds.has(member.userId),
  );

  // `listTeamMembers` solo devuelve ids; el nombre sale de los miembros del
  // workspace, que ya estan cargados para el selector de anadir.
  const nameByUserId = new Map(
    (workspaceUsers ?? []).map((member) => [
      member.userId,
      member.user?.name ?? member.user?.email ?? member.userId,
    ]),
  );

  const run = async (action: Promise<unknown>, fallback: string) => {
    try {
      await action;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : fallback);
    }
  };

  return (
    <Dialog open={Boolean(team)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t("settings:workspaceTeams.membersTitle", {
              defaultValue: "Team members",
              name: team?.name ?? "",
            })}
          </DialogTitle>
          <DialogDescription>{team?.name}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="divide-y divide-border max-h-56 overflow-y-auto">
            {(members ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">
                {t("settings:workspaceTeams.noMembers", {
                  defaultValue: "This team has no members yet.",
                })}
              </p>
            ) : (
              (members ?? []).map((member) => (
                <div
                  key={member.id}
                  className="flex items-center justify-between py-2"
                >
                  <span className="text-sm truncate">
                    {nameByUserId.get(member.userId) ?? member.userId}
                  </span>
                  <div className="ml-auto flex items-center gap-2">
                    {canManage && team ? (
                      <span className="flex items-center gap-2 text-meta text-muted-foreground">
                        {t("lead:teams.badge")}
                        <Switch
                          aria-label={t("lead:teams.toggle", {
                            name:
                              nameByUserId.get(member.userId) ?? member.userId,
                          })}
                          checked={leadIds.has(member.userId)}
                          disabled={setLead.isPending}
                          onCheckedChange={(checked) =>
                            run(
                              setLead.mutateAsync({
                                teamId: team.id,
                                userId: member.userId,
                                isLead: checked,
                              }),
                              t("lead:teams.error"),
                            )
                          }
                        />
                      </span>
                    ) : (
                      leadIds.has(member.userId) && (
                        <span className="rounded bg-muted px-1.5 text-meta text-muted-foreground">
                          {t("lead:teams.badge")}
                        </span>
                      )
                    )}
                    {canManage && team && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        aria-label={t("settings:workspaceTeams.removeMember", {
                          defaultValue: "Remove from team",
                        })}
                        onClick={() =>
                          run(
                            removeMember.mutateAsync({
                              teamId: team.id,
                              userId: member.userId,
                            }),
                            t("settings:workspaceTeams.removeMemberError", {
                              defaultValue: "Failed to remove member",
                            }),
                          )
                        }
                      >
                        <UserMinus className="size-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
          <p className="text-meta text-muted-foreground">
            {t("lead:teams.hint")}
          </p>

          {canManage && candidates.length > 0 && team && (
            <div className="space-y-2">
              <Label>
                {t("settings:workspaceTeams.addMember", {
                  defaultValue: "Add a member",
                })}
              </Label>
              <div className="divide-y divide-border max-h-40 overflow-y-auto">
                {candidates.map((member) => (
                  <button
                    key={member.id}
                    type="button"
                    className="flex w-full items-center gap-2 py-2 text-left hover:bg-muted/50"
                    onClick={() =>
                      run(
                        addMember.mutateAsync({
                          teamId: team.id,
                          userId: member.userId,
                        }),
                        t("settings:workspaceTeams.addMemberError", {
                          defaultValue: "Failed to add member",
                        }),
                      )
                    }
                  >
                    <Avatar className="h-6 w-6">
                      <AvatarImage src={member.user?.image ?? ""} alt="" />
                      <AvatarFallback className="text-xs">
                        {getInitials(member.user?.name)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-sm truncate">
                      {member.user?.name ?? member.user?.email ?? member.userId}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("common:actions.close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
