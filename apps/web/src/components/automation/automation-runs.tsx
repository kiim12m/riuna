import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogPanel,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import type { AutomationRun, RunStatus } from "@/fetchers/automation";
import { useGetAutomationRuns } from "@/hooks/queries/automation/use-automations";
import { formatDateTime } from "@/lib/format";

export const RUN_BADGE: Record<RunStatus, "success" | "error" | "secondary"> = {
  ok: "success",
  failed: "error",
  skipped: "secondary",
};

function RunLine({ run }: { run: AutomationRun }) {
  const { t } = useTranslation();
  const reason = run.detail.reason
    ? t(`settings:automations.reasons.${run.detail.reason}`, {
        defaultValue: run.detail.reason,
      })
    : null;
  const failed = run.detail.actions?.find(
    (action) => action.status === "failed",
  );
  const error = failed?.error ?? run.detail.error ?? null;

  return (
    <li className="space-y-1 border-border border-b py-2 last:border-b-0">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge variant={RUN_BADGE[run.status]}>
          {t(`settings:automations.status.${run.status}`)}
        </Badge>
        <span className="text-muted-foreground text-xs">
          {formatDateTime(run.startedAt)}
        </span>
        {run.taskTitle && (
          <span className="min-w-0 truncate">
            {run.taskNumber !== null ? `#${run.taskNumber} ` : ""}
            {run.taskTitle}
          </span>
        )}
      </div>
      {reason && <p className="text-muted-foreground text-xs">{reason}</p>}
      {failed && (
        <p className="text-xs">
          {t("settings:automations.runs.failedAction", {
            action: t(`settings:automations.actions.${failed.type}`),
          })}
        </p>
      )}
      {error && (
        <p className="break-words font-mono text-destructive-foreground text-xs">
          {error}
        </p>
      )}
    </li>
  );
}

/** El historial de una regla (3.2): lo que hizo, lo que no y por que. */
export function AutomationRuns({
  automationId,
  name,
  onClose,
}: {
  automationId: string | null;
  name: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const runs = useGetAutomationRuns(automationId);
  const items = runs.data?.pages.flat() ?? [];

  return (
    <Dialog
      open={automationId !== null}
      onOpenChange={(open) => !open && onClose()}
    >
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {t("settings:automations.runs.title", { name })}
          </DialogTitle>
        </DialogHeader>
        <DialogPanel className="space-y-3">
          {runs.isPending ? (
            <Skeleton className="h-24 w-full" />
          ) : items.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              {t("settings:automations.runs.empty")}
            </p>
          ) : (
            <ul data-testid="automation-runs">
              {items.map((run) => (
                <RunLine key={run.id} run={run} />
              ))}
            </ul>
          )}
          {runs.hasNextPage && (
            <Button
              variant="outline"
              size="sm"
              disabled={runs.isFetchingNextPage}
              onClick={() => runs.fetchNextPage()}
            >
              {t("settings:automations.runs.more")}
            </Button>
          )}
        </DialogPanel>
      </DialogContent>
    </Dialog>
  );
}
