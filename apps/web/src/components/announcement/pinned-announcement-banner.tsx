import { Link } from "@tanstack/react-router";
import { Pin, X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { usePinnedAnnouncement } from "@/hooks/queries/announcement/use-announcements";

const HIDDEN_KEY = "riuna:hidden-announcements";

// Ocultar la franja es cosa de cada uno y de este navegador (ADR 081): el aviso
// sigue en el tablon. Se guarda el aviso con su ultima edicion, para que un
// cambio vuelva a sacarlo.
function readHidden(): string[] {
  try {
    const raw = localStorage.getItem(HIDDEN_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((v) => typeof v === "string")
      : [];
  } catch {
    return [];
  }
}

function writeHidden(keys: string[]) {
  try {
    localStorage.setItem(HIDDEN_KEY, JSON.stringify(keys.slice(-50)));
  } catch {
    // Sin almacenamiento, ocultar dura lo que dure la pestaña.
  }
}

export function PinnedAnnouncementBanner({
  workspaceId,
  projectId,
}: {
  workspaceId: string;
  projectId: string;
}) {
  const { t } = useTranslation();
  const { data: pinned } = usePinnedAnnouncement(workspaceId, projectId);
  const [hidden, setHidden] = useState(readHidden);

  if (!pinned) return null;
  const key = `${pinned.id}:${pinned.updatedAt}`;
  if (hidden.includes(key)) return null;

  const hide = () => {
    const next = [...hidden, key];
    setHidden(next);
    writeHidden(next);
  };

  return (
    <div
      className="flex shrink-0 items-center gap-2 border-brand/30 border-b bg-accent px-3 py-1.5 text-xs"
      data-testid="pinned-announcement"
    >
      <Pin className="size-3.5 shrink-0 text-brand-strong" />
      <span className="min-w-0 flex-1 truncate">
        <span className="font-semibold">
          {pinned.projectId
            ? t("announcements:banner.project")
            : t("announcements:banner.workspace")}
        </span>{" "}
        {pinned.title}
      </span>
      <Button
        variant="ghost"
        size="xs"
        render={
          pinned.projectId ? (
            <Link
              to="/dashboard/workspace/$workspaceId/project/$projectId/announcements"
              params={{ workspaceId, projectId: pinned.projectId }}
            />
          ) : (
            <Link
              to="/dashboard/workspace/$workspaceId/announcements"
              params={{ workspaceId }}
            />
          )
        }
      >
        {t("announcements:banner.open")}
      </Button>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={t("announcements:banner.hide")}
        onClick={hide}
      >
        <X className="size-3.5" />
      </Button>
    </div>
  );
}
