import { useState } from "react";
import { useTranslation } from "react-i18next";
import CommentEditor from "@/components/activity/comment-editor";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { Announcement, AnnouncementInput } from "@/fetchers/announcement";

type AnnouncementDialogProps = {
  open: boolean;
  /** El aviso que se edita; sin él, se publica uno nuevo. */
  announcement?: Announcement | null;
  pending: boolean;
  onClose: () => void;
  onSave: (input: AnnouncementInput, notify: boolean) => void;
};

function toDayInput(iso: string | null) {
  if (!iso) return "";
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Publicar o editar un aviso (ADR 081). «Fijado hasta» es un día entero: el
 * aviso deja de salir como franja al acabar ese día. Avisar a los miembros
 * solo se elige al publicar; editar no vuelve a avisar.
 */
export function AnnouncementDialog({
  open,
  announcement,
  pending,
  onClose,
  onSave,
}: AnnouncementDialogProps) {
  const { t } = useTranslation();
  const editing = Boolean(announcement);
  const [title, setTitle] = useState(announcement?.title ?? "");
  const [content, setContent] = useState(announcement?.content ?? "");
  const [pinned, setPinned] = useState(announcement?.pinned ?? false);
  const [until, setUntil] = useState(
    toDayInput(announcement?.pinnedUntil ?? null),
  );
  const [notify, setNotify] = useState(true);

  const save = () =>
    onSave(
      {
        title: title.trim(),
        content,
        pinned,
        pinnedUntil:
          pinned && until ? new Date(`${until}T23:59:59`).toISOString() : null,
      },
      notify,
    );

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {editing
              ? t("announcements:dialog.editTitle")
              : t("announcements:dialog.newTitle")}
          </DialogTitle>
          <DialogDescription>
            {t("announcements:dialog.description")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="announcement-title">
              {t("announcements:dialog.title")}
            </Label>
            <Input
              id="announcement-title"
              value={title}
              maxLength={200}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={t("announcements:dialog.titlePlaceholder")}
            />
          </div>

          <div className="rounded-xl border border-border/80 bg-card/70">
            <CommentEditor
              value={content}
              onChange={setContent}
              placeholder={t("announcements:dialog.contentPlaceholder")}
              showQuickAttachButton={false}
              className="[&_.riuna-comment-editor-content_.ProseMirror]:min-h-[8rem] [&_.riuna-comment-editor-content_.ProseMirror]:px-3 [&_.riuna-comment-editor-content_.ProseMirror]:py-3"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Label className="flex items-center gap-2">
              <Switch checked={pinned} onCheckedChange={setPinned} />
              {t("announcements:dialog.pin")}
            </Label>
            {pinned && (
              <div className="flex items-center gap-2">
                <Label
                  htmlFor="announcement-until"
                  className="text-muted-foreground text-xs"
                >
                  {t("announcements:dialog.pinUntil")}
                </Label>
                <Input
                  id="announcement-until"
                  type="date"
                  className="w-40"
                  value={until}
                  onChange={(event) => setUntil(event.target.value)}
                />
              </div>
            )}
          </div>

          {!editing && (
            <Label className="flex items-center gap-2">
              <Switch checked={notify} onCheckedChange={setNotify} />
              {t("announcements:dialog.notify")}
            </Label>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>
            {t("common:actions.cancel")}
          </Button>
          <Button
            size="sm"
            disabled={!title.trim() || pending}
            onClick={save}
            data-testid="announcement-save"
          >
            {editing
              ? t("announcements:dialog.save")
              : t("announcements:dialog.publish")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
