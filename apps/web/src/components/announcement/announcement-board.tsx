import { Link } from "@tanstack/react-router";
import { Megaphone, Pencil, Pin, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { MarkdownRenderer } from "@/components/public-project/markdown-renderer";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import type { Announcement, AnnouncementScope } from "@/fetchers/announcement";
import { useAnnouncementMutations } from "@/hooks/mutations/announcement/use-announcement-mutations";
import { useAnnouncements } from "@/hooks/queries/announcement/use-announcements";
import { cn } from "@/lib/cn";
import { formatDateMedium, formatDateTime } from "@/lib/format";
import { getInitials } from "@/lib/get-initials";
import { toast } from "@/lib/toast";
import { AnnouncementDialog } from "./announcement-dialog";

type AnnouncementBoardProps = {
  workspaceId: string;
  scope: AnnouncementScope;
  /** Quien puede publicar aqui: lo decide la API, esto solo esconde botones. */
  canPublish: boolean;
};

function AnnouncementCard({
  announcement,
  canPublish,
  onEdit,
  onDelete,
}: {
  announcement: Announcement;
  canPublish: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const author = announcement.author;

  return (
    <article
      className={cn(
        "space-y-2 rounded-lg border border-border bg-card px-4 py-3",
        announcement.pinnedNow && "border-brand/40",
      )}
      data-testid="announcement-card"
    >
      <header className="flex items-start gap-2">
        {announcement.pinnedNow && (
          <Pin className="mt-0.5 size-4 shrink-0 text-brand-strong" />
        )}
        <h2 className="min-w-0 flex-1 font-semibold text-sm">
          {announcement.title}
        </h2>
        {canPublish && (
          <div className="flex shrink-0 gap-1">
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={t("announcements:edit")}
              onClick={onEdit}
            >
              <Pencil className="size-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={t("announcements:delete")}
              onClick={onDelete}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        )}
      </header>
      {announcement.content && (
        <div className="text-sm">
          <MarkdownRenderer content={announcement.content} />
        </div>
      )}
      <footer className="flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground text-xs">
        {author && (
          <Avatar className="size-5">
            <AvatarImage src={author.image ?? ""} alt={author.name ?? ""} />
            <AvatarFallback className="text-[0.6rem]">
              {getInitials(author.name ?? "")}
            </AvatarFallback>
          </Avatar>
        )}
        <span title={formatDateTime(announcement.createdAt)}>
          {author?.name ?? t("common:people.someone")} ·{" "}
          {formatDateMedium(announcement.createdAt)}
        </span>
        {announcement.pinnedNow && (
          <span>
            ·{" "}
            {announcement.pinnedUntil
              ? t("announcements:pinnedUntil", {
                  date: formatDateMedium(announcement.pinnedUntil),
                })
              : t("announcements:pinned")}
          </span>
        )}
        {announcement.notified && <span>· {t("announcements:notified")}</span>}
      </footer>
    </article>
  );
}

/** El tablón de avisos de un proyecto o del espacio (ADR 081). */
export function AnnouncementBoard({
  workspaceId,
  scope,
  canPublish,
}: AnnouncementBoardProps) {
  const { t } = useTranslation();
  const { data: announcements = [], isLoading } = useAnnouncements(
    workspaceId,
    scope,
  );
  const { create, update, remove } = useAnnouncementMutations(
    workspaceId,
    scope,
  );
  const [editing, setEditing] = useState<Announcement | null>(null);
  const [creating, setCreating] = useState(false);

  const fail = (error: unknown) =>
    toast.error(
      error instanceof Error ? error.message : t("announcements:saveError"),
    );

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 px-4 py-6">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <h1 className="text-page">
            {scope.kind === "project"
              ? t("announcements:projectTitle")
              : t("announcements:workspaceTitle")}
          </h1>
          <p className="text-muted-foreground text-sm">
            {scope.kind === "project"
              ? t("announcements:projectSubtitle")
              : t("announcements:workspaceSubtitle")}
          </p>
          {scope.kind === "project" && (
            <Link
              to="/dashboard/workspace/$workspaceId/announcements"
              params={{ workspaceId }}
              className="text-brand-strong text-xs hover:underline"
            >
              {t("announcements:seeWorkspace")}
            </Link>
          )}
        </div>
        {canPublish && (
          <Button
            size="sm"
            className="gap-1.5"
            onClick={() => setCreating(true)}
            data-testid="announcement-new"
          >
            <Megaphone className="size-4" />
            {t("announcements:new")}
          </Button>
        )}
      </div>

      {isLoading ? (
        <p className="text-muted-foreground text-sm">
          {t("announcements:loading")}
        </p>
      ) : announcements.length === 0 ? (
        <div className="rounded-lg border border-border border-dashed px-4 py-10 text-center">
          <p className="font-medium text-sm">{t("announcements:empty")}</p>
          <p className="text-muted-foreground text-xs">
            {canPublish
              ? t("announcements:emptyCanPublish")
              : t("announcements:emptyReadOnly")}
          </p>
        </div>
      ) : (
        <div className="space-y-3" data-testid="announcement-list">
          {announcements.map((announcement) => (
            <AnnouncementCard
              key={announcement.id}
              announcement={announcement}
              canPublish={canPublish}
              onEdit={() => setEditing(announcement)}
              onDelete={() => {
                if (!window.confirm(t("announcements:deleteConfirm"))) return;
                remove.mutate(announcement.id, {
                  onSuccess: () => toast.success(t("announcements:deleted")),
                  onError: fail,
                });
              }}
            />
          ))}
        </div>
      )}

      {creating && (
        <AnnouncementDialog
          open
          pending={create.isPending}
          onClose={() => setCreating(false)}
          onSave={(input, notify) =>
            create.mutate(
              { ...input, notify },
              {
                onSuccess: () => {
                  setCreating(false);
                  toast.success(t("announcements:published"));
                },
                onError: fail,
              },
            )
          }
        />
      )}

      {editing && (
        <AnnouncementDialog
          open
          announcement={editing}
          pending={update.isPending}
          onClose={() => setEditing(null)}
          onSave={(input) =>
            update.mutate(
              { id: editing.id, input },
              {
                onSuccess: () => {
                  setEditing(null);
                  toast.success(t("announcements:saved"));
                },
                onError: fail,
              },
            )
          }
        />
      )}
    </div>
  );
}
