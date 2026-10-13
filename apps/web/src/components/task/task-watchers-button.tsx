import { Eye, EyeOff, Plus, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/components/providers/auth-provider/hooks/use-auth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useSetWatching } from "@/hooks/mutations/task-watcher/use-set-watching";
import { useTaskWatchers } from "@/hooks/queries/task-watcher/use-task-watchers";
import { useGetActiveWorkspaceUsers } from "@/hooks/queries/workspace-users/use-get-active-workspace-users";
import { useEditableUntilKnown } from "@/hooks/use-workspace-permission";
import { cn } from "@/lib/cn";
import { getInitials } from "@/lib/get-initials";
import { toast } from "@/lib/toast";

type TaskWatchersButtonProps = {
  taskId: string;
  workspaceId: string;
  /** Sin la palabra, para el lateral estrecho del escritorio. */
  iconOnly?: boolean;
  className?: string;
};

/**
 * «Observar» en el detalle de la tarea (ADR 076): quien observa, a proposito
 * o por estar asignado, y observar o dejar de observar. Poner o quitar a otra
 * persona es repartir, asi que solo se ofrece a quien puede asignar.
 */
export default function TaskWatchersButton({
  taskId,
  workspaceId,
  iconOnly = false,
  className,
}: TaskWatchersButtonProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [adding, setAdding] = useState(false);
  const { data: watchers = [] } = useTaskWatchers(taskId);
  const { data: workspaceUsers } = useGetActiveWorkspaceUsers(workspaceId);
  const canAssign = useEditableUntilKnown("assignTasks");
  const { mutate: setWatching, isPending } = useSetWatching(taskId);

  const me = watchers.find((watcher) => watcher.userId === user?.id);
  const watchingNow = Boolean(me);

  const candidates = useMemo(() => {
    const present = new Set(watchers.map((watcher) => watcher.userId));
    return (workspaceUsers?.members ?? [])
      .filter((member) => !present.has(member.userId))
      .map((member) => ({
        userId: member.userId,
        name: member.user?.name ?? member.userId,
        image: member.user?.image ?? "",
      }));
  }, [watchers, workspaceUsers]);

  const change = (watch: boolean, userId?: string) =>
    setWatching(
      { watch, userId },
      {
        onError: (error) =>
          toast.error(
            error instanceof Error
              ? error.message
              : t("tasks:watchers.updateError"),
          ),
      },
    );

  return (
    <Popover onOpenChange={(open) => !open && setAdding(false)}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          aria-pressed={watchingNow}
          data-testid="task-watchers-button"
          className={cn(
            "gap-1.5 text-foreground",
            watchingNow && "border-brand/45 bg-accent text-brand-strong",
            className,
          )}
        >
          <Eye className="size-4" />
          <span className={iconOnly ? "sr-only" : "hidden sm:inline"}>
            {watchingNow
              ? t("tasks:watchers.watching")
              : t("tasks:watchers.watch")}
          </span>
          <span className="tabular-nums">{watchers.length}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-1" align="end">
        <p className="px-2 pt-1.5 pb-1 text-label font-semibold uppercase tracking-wide text-muted-foreground">
          {t("tasks:watchers.title")}
        </p>

        {watchers.length === 0 ? (
          <p className="px-2 py-1.5 text-sm text-muted-foreground">
            {t("tasks:watchers.empty")}
          </p>
        ) : (
          <ul className="max-h-60 space-y-0.5 overflow-y-auto">
            {watchers.map((watcher) => {
              const isMe = watcher.userId === user?.id;
              const removable = watcher.watching && !isMe && canAssign;
              return (
                <li
                  key={watcher.userId}
                  className="flex items-center gap-2 rounded-md px-2 py-1"
                >
                  <Avatar className="h-6 w-6">
                    <AvatarImage
                      src={watcher.image ?? ""}
                      alt={watcher.name ?? ""}
                    />
                    <AvatarFallback className="text-xs font-medium border border-border/30">
                      {getInitials(watcher.name ?? "")}
                    </AvatarFallback>
                  </Avatar>
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {watcher.name}
                    {isMe && (
                      <span className="text-muted-foreground">
                        {" "}
                        {t("tasks:watchers.you")}
                      </span>
                    )}
                  </span>
                  {watcher.assignee && (
                    <span className="shrink-0 text-meta text-muted-foreground">
                      {t("tasks:watchers.assignee")}
                    </span>
                  )}
                  {removable && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-6 shrink-0"
                      disabled={isPending}
                      aria-label={t("tasks:watchers.remove", {
                        name: watcher.name,
                      })}
                      onClick={() => change(false, watcher.userId)}
                    >
                      <X className="size-3.5" />
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <p className="px-2 py-1.5 text-meta leading-snug text-muted-foreground">
          {t("tasks:watchers.help")}
        </p>

        <div className="border-t border-border pt-1">
          {me?.assignee ? (
            <p className="px-2 py-1.5 text-meta text-muted-foreground">
              {t("tasks:watchers.assignedHint")}
            </p>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-full justify-start gap-2 px-2"
              disabled={isPending}
              data-testid="task-watchers-toggle"
              onClick={() => change(!watchingNow)}
            >
              {watchingNow ? (
                <EyeOff className="size-4" />
              ) : (
                <Eye className="size-4" />
              )}
              {watchingNow
                ? t("tasks:watchers.stopWatching")
                : t("tasks:watchers.startWatching")}
            </Button>
          )}

          {canAssign && candidates.length > 0 && !adding && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-full justify-start gap-2 px-2"
              onClick={() => setAdding(true)}
            >
              <Plus className="size-4" />
              {t("tasks:watchers.add")}
            </Button>
          )}

          {canAssign && adding && (
            <ul className="max-h-48 space-y-0.5 overflow-y-auto">
              {candidates.map((candidate) => (
                <li key={candidate.userId}>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-full justify-start gap-2 px-2"
                    disabled={isPending}
                    onClick={() => change(true, candidate.userId)}
                  >
                    <Avatar className="h-6 w-6">
                      <AvatarImage src={candidate.image} alt={candidate.name} />
                      <AvatarFallback className="text-xs font-medium border border-border/30">
                        {getInitials(candidate.name)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="truncate text-sm">{candidate.name}</span>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
