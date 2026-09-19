import { Check, Users } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ShortcutNumber } from "@/components/ui/shortcut-number";
import { useUpdateTaskTeam } from "@/hooks/mutations/task/use-update-task-team";
import useGetTeams from "@/hooks/queries/team/use-get-teams";
import { useNumberedShortcuts } from "@/hooks/use-numbered-shortcuts";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { toast } from "@/lib/toast";
import type Task from "@/types/task";

type TaskTeamPopoverProps = {
  task: Task;
  workspaceId: string;
  children: React.ReactNode;
};

// A diferencia del selector de personas, aqui no hay paginacion ni scroll
// incremental: Better Auth limita a 10 equipos por workspace.
export default function TaskTeamPopover({
  task,
  workspaceId,
  children,
}: TaskTeamPopoverProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { mutateAsync: updateTaskTeam } = useUpdateTaskTeam();
  const { data: teams } = useGetTeams({ workspaceId });
  const { canAssignTasks } = useWorkspacePermission();
  const canAssign = canAssignTasks();

  const handleTeamChange = useCallback(
    async (newTeamId: string) => {
      try {
        await updateTaskTeam({
          ...task,
          teamId: newTeamId,
        });
        setOpen(false);
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : t("tasks:popover.team.updateError"),
        );
      }
    },
    [t, task, updateTaskTeam],
  );

  const shortcutOptions = useMemo(() => {
    const noTeamOption = { onSelect: () => handleTeamChange("") };
    const teamOptions = (teams ?? []).slice(0, 8).map((team) => ({
      onSelect: () => handleTeamChange(team.id),
    }));
    return [noTeamOption, ...teamOptions];
  }, [teams, handleTeamChange]);

  useNumberedShortcuts(open, shortcutOptions);

  if (!canAssign) return <>{children}</>;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-56 p-0" align="start">
        <div className="max-h-80 space-y-1 overflow-y-auto p-1">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2 h-8 px-2"
            onClick={() => handleTeamChange("")}
          >
            <div
              className="w-6 h-6 rounded-full bg-muted border border-border flex items-center justify-center"
              title={t("tasks:popover.team.unassigned")}
            >
              <span className="text-label font-medium text-muted-foreground">
                ?
              </span>
            </div>
            <span className="text-sm">
              {t("tasks:popover.team.unassigned")}
            </span>
            {!task.teamId ? (
              <Check className="ml-auto h-4 w-4" />
            ) : (
              <ShortcutNumber number={1} />
            )}
          </Button>
          {(teams ?? []).map((team, index) => (
            <Button
              key={team.id}
              variant="ghost"
              size="sm"
              className="w-full justify-start gap-2 h-8 px-2"
              onClick={() => handleTeamChange(team.id)}
            >
              <div className="w-6 h-6 rounded-full bg-muted border border-border/30 flex items-center justify-center">
                <Users className="h-3 w-3 text-muted-foreground" />
              </div>
              <span className="text-sm truncate">{team.name}</span>
              {task.teamId === team.id ? (
                <Check className="ml-auto h-4 w-4 shrink-0" />
              ) : index < 8 ? (
                <ShortcutNumber number={index + 2} />
              ) : null}
            </Button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
