import { Copy } from "lucide-react";
import { useTranslation } from "react-i18next";
import { parseDayKey } from "@/components/schedule/schedule-range";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useStandup } from "@/hooks/queries/review/use-standup";
import { formatDate } from "@/lib/format";
import { type StandupLabels, standupMarkdown } from "@/lib/standup";
import { toast } from "@/lib/toast";

/**
 * El stand-up de quien mira (sub-bloque 2.4): ayer, hoy y bloqueos,
 * derivado de su plan y su ultimo cierre. No se guarda ni se publica: se
 * copia en Markdown para pegarlo donde el equipo lo comparta. Enviarlo solo a
 * Slack o Telegram queda para la Fase 8.
 */
export function StandupDialog({
  workspaceId,
  open,
  onOpenChange,
}: {
  workspaceId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const { data, isPending } = useStandup(workspaceId, open);

  const labels: StandupLabels = {
    yesterday: t("rituals:standup.yesterday"),
    today: t("rituals:standup.today"),
    blockers: t("rituals:standup.blockers"),
    nothingDone: t("rituals:standup.nothingDone"),
    nothingPlanned: t("rituals:standup.nothingPlanned"),
    noBlockers: t("rituals:standup.noBlockers"),
    day: (key) =>
      formatDate(parseDayKey(key), {
        weekday: "short",
        day: "numeric",
        month: "short",
      }),
  };
  const markdown = data ? standupMarkdown(data, labels) : "";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(markdown);
      toast.success(t("rituals:standup.copied"));
    } catch {
      toast.error(t("rituals:standup.copyError"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("rituals:standup.title")}</DialogTitle>
          <DialogDescription>{t("rituals:standup.hint")}</DialogDescription>
        </DialogHeader>
        <DialogPanel scrollFade={false}>
          {isPending || !data ? (
            <Skeleton className="h-32 w-full" />
          ) : (
            <pre
              className="whitespace-pre-wrap rounded-md border border-border/70 bg-muted/40 p-3 font-sans text-body"
              data-testid="standup-markdown"
            >
              {markdown}
            </pre>
          )}
        </DialogPanel>
        <DialogFooter>
          <Button onClick={copy} disabled={!data}>
            <Copy />
            {t("rituals:standup.copy")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
