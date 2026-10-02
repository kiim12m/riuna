import { CalendarPlus, Check, Copy } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ConfirmDeleteDialog } from "@/components/common/confirm-delete-dialog";
import { Button } from "@/components/ui/button";
import { calendarFeedUrl } from "@/fetchers/calendar";
import { useCalendarFeedMutations } from "@/hooks/mutations/calendar/use-calendar-feed-mutations";
import { useCalendarFeed } from "@/hooks/queries/calendar/use-calendar-feed";
import useActiveWorkspace from "@/hooks/queries/workspace/use-active-workspace";
import { copyToClipboard } from "@/lib/copy-to-clipboard";
import { toast } from "@/lib/toast";

/**
 * El enlace del calendario del espacio activo (ADR 057). El enlace entero
 * solo se ve al crearlo o regenerarlo: la API guarda su hash, no el token.
 * El texto dice claro que quien lo tenga ve esos datos.
 */
export function CalendarFeedSection() {
  const { t, i18n } = useTranslation();
  const { data: workspace } = useActiveWorkspace();
  const workspaceId = workspace?.id ?? "";
  const { data: feed } = useCalendarFeed(workspaceId);
  const { create, revoke } = useCalendarFeedMutations(workspaceId);
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirm, setConfirm] = useState<"regenerate" | "revoke" | null>(null);

  if (!workspace) return null;

  const generate = () =>
    create.mutate(undefined, {
      onSuccess: ({ token }) => {
        setUrl(calendarFeedUrl(token));
        setCopied(false);
      },
      onError: () => toast.error(t("calendar:feed.error")),
    });

  const copy = async () => {
    if (!url) return;
    if (await copyToClipboard(url)) {
      setCopied(true);
      toast.success(t("calendar:feed.copied"));
    }
  };

  const since = feed?.createdAt
    ? new Intl.DateTimeFormat(i18n.language, { dateStyle: "long" }).format(
        new Date(feed.createdAt),
      )
    : null;

  return (
    <div className="space-y-6" data-testid="calendar-feed-section">
      <div className="space-y-1">
        <h2 className="text-md font-medium">{t("calendar:feed.title")}</h2>
        <p className="text-xs text-muted-foreground">
          {t("calendar:feed.subtitle", { workspace: workspace.name })}
        </p>
      </div>
      <div className="space-y-3 rounded-md border border-border bg-sidebar p-4">
        <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <span className="text-sm">
            {feed?.active && since
              ? t("calendar:feed.activeSince", { date: since })
              : t("calendar:feed.inactive")}
          </span>
          <div className="flex flex-wrap gap-2">
            {feed?.active ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={create.isPending}
                  onClick={() => setConfirm("regenerate")}
                >
                  {t("calendar:feed.regenerate")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={revoke.isPending}
                  onClick={() => setConfirm("revoke")}
                >
                  {t("calendar:feed.revoke")}
                </Button>
              </>
            ) : (
              <Button size="sm" disabled={create.isPending} onClick={generate}>
                {t("calendar:feed.create")}
              </Button>
            )}
          </div>
        </div>

        {url && feed?.active && (
          <div className="space-y-2" data-testid="calendar-feed-url">
            <p className="text-xs font-medium">{t("calendar:feed.onlyOnce")}</p>
            <div className="rounded-sm border border-border bg-background p-2.5">
              <code className="break-all font-mono text-xs">{url}</code>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={copy}>
                {copied ? <Check /> : <Copy />}
                {t("calendar:feed.copy")}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                render={
                  // `webcal:` abre la suscripcion en el calendario del
                  // sistema (Apple, Outlook); Google pide pegar la URL.
                  <a href={url.replace(/^https?:/, "webcal:")} />
                }
              >
                <CalendarPlus />
                {t("calendar:feed.open")}
              </Button>
            </div>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          {t("calendar:feed.privacy")}
        </p>
      </div>

      <ConfirmDeleteDialog
        open={confirm !== null}
        onOpenChange={(open) => {
          if (!open) setConfirm(null);
        }}
        title={t(
          confirm === "revoke"
            ? "calendar:feed.revokeTitle"
            : "calendar:feed.regenerateTitle",
        )}
        description={t("calendar:feed.confirmDescription")}
        confirmLabel={t(
          confirm === "revoke"
            ? "calendar:feed.revoke"
            : "calendar:feed.regenerate",
        )}
        isPending={create.isPending || revoke.isPending}
        onConfirm={() => {
          if (confirm === "revoke") {
            revoke.mutate(undefined, { onSuccess: () => setUrl(null) });
          } else {
            generate();
          }
        }}
      />
    </div>
  );
}
