import { Check } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ShortcutNumber } from "@/components/ui/shortcut-number";
import { useUpdateTaskAssignees } from "@/hooks/mutations/task/use-update-task-assignees";
import { useGetActiveWorkspaceUsers } from "@/hooks/queries/workspace-users/use-get-active-workspace-users";
import { useControllableOpen } from "@/hooks/use-controllable-open";
import { useNumberedShortcuts } from "@/hooks/use-numbered-shortcuts";
import { useEditableUntilKnown } from "@/hooks/use-workspace-permission";
import { getInitials } from "@/lib/get-initials";
import { toast } from "@/lib/toast";
import type Task from "@/types/task";

const INITIAL_VISIBLE_USERS = 40;
const VISIBLE_USERS_STEP = 40;

type TaskAssigneePopoverProps = {
  task: Task;
  workspaceId: string;
  children: React.ReactNode;
  /**
   * Abierto desde fuera -los atajos del detalle-. Sin ellos, el desplegable
   * lleva su propio estado, como siempre.
   */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export default function TaskAssigneePopover({
  task,
  workspaceId,
  children,
  open: openProp,
  onOpenChange,
}: TaskAssigneePopoverProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useControllableOpen(openProp, onOpenChange);
  const [visibleUsersCount, setVisibleUsersCount] = useState(
    INITIAL_VISIBLE_USERS,
  );
  const { mutateAsync: updateTaskAssignees } = useUpdateTaskAssignees();
  const { data: workspaceUsers } = useGetActiveWorkspaceUsers(workspaceId);
  const canAssign = useEditableUntilKnown("assignTasks");

  const usersOptions = useMemo(() => {
    return workspaceUsers?.members?.map((member) => ({
      label: member?.user?.name ?? member.userId,
      value: member.userId,
      image: member?.user?.image ?? "",
      name: member?.user?.name ?? "",
    }));
  }, [workspaceUsers]);

  // El conjunto de asignados manda; `userId` es solo el principal y se usa
  // como respaldo en las vistas que todavia no piden la lista completa.
  const selectedIds = useMemo(() => {
    if (task.assignees?.length) return task.assignees.map((user) => user.id);
    return task.userId ? [task.userId] : [];
  }, [task.assignees, task.userId]);

  const applyAssignees = useCallback(
    async (userIds: string[]) => {
      try {
        await updateTaskAssignees({ taskId: task.id, userIds });
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : t("tasks:popover.assignee.updateError"),
        );
      }
    },
    [t, task.id, updateTaskAssignees],
  );

  // Alternar no cierra el desplegable: asignar a varias personas de una vez es
  // el caso normal, y cerrarlo en cada clic obligaria a reabrirlo.
  const handleToggle = useCallback(
    (userId: string) => {
      void applyAssignees(
        selectedIds.includes(userId)
          ? selectedIds.filter((id) => id !== userId)
          : [...selectedIds, userId],
      );
    },
    [applyAssignees, selectedIds],
  );

  const handleClear = useCallback(() => {
    void applyAssignees([]);
    setOpen(false);
  }, [applyAssignees, setOpen]);

  const shortcutOptions = useMemo(() => {
    const unassignedOption = { onSelect: handleClear };
    const userOptions = (usersOptions || []).slice(0, 8).map((user) => ({
      onSelect: () => handleToggle(user.value),
    }));
    return [unassignedOption, ...userOptions];
  }, [usersOptions, handleClear, handleToggle]);

  const visibleUsersOptions = useMemo(() => {
    return usersOptions?.slice(0, visibleUsersCount) ?? [];
  }, [usersOptions, visibleUsersCount]);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      setOpen(nextOpen);
      if (nextOpen) {
        setVisibleUsersCount(INITIAL_VISIBLE_USERS);
      }
    },
    [setOpen],
  );

  const handleListScroll = useCallback(
    (event: React.UIEvent<HTMLDivElement>) => {
      const target = event.currentTarget;
      const nearBottom =
        target.scrollHeight - target.scrollTop - target.clientHeight < 48;

      if (!nearBottom) return;

      setVisibleUsersCount((current) => {
        const totalUsers = usersOptions?.length ?? current;
        return Math.min(current + VISIBLE_USERS_STEP, totalUsers);
      });
    },
    [usersOptions?.length],
  );

  useNumberedShortcuts(open, shortcutOptions);

  if (!canAssign) return <>{children}</>;

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-56 p-0" align="start">
        <div
          className="max-h-80 space-y-1 overflow-y-auto p-1"
          onScroll={handleListScroll}
        >
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2 h-8 px-2"
            onClick={handleClear}
          >
            <div
              className="w-6 h-6 rounded-full bg-muted border border-border flex items-center justify-center"
              title={t("tasks:popover.assignee.unassigned")}
            >
              <span className="text-label font-medium text-muted-foreground">
                ?
              </span>
            </div>
            <span className="text-sm">
              {t("tasks:popover.assignee.unassigned")}
            </span>
            {selectedIds.length === 0 ? (
              <Check className="ml-auto h-4 w-4" />
            ) : (
              <ShortcutNumber number={1} />
            )}
          </Button>
          {visibleUsersOptions.map((user, index) => (
            <Button
              key={user.value}
              variant="ghost"
              size="sm"
              className="w-full justify-start gap-2 h-8 px-2"
              onClick={() => handleToggle(user.value)}
            >
              <Avatar className="h-6 w-6">
                <AvatarImage src={user.image ?? ""} alt={user.name || ""} />
                <AvatarFallback className="text-xs font-medium border border-border/30">
                  {getInitials(user.name)}
                </AvatarFallback>
              </Avatar>
              <span className="text-sm truncate">{user.label}</span>
              {selectedIds.includes(user.value) ? (
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
