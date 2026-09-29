import { useTranslation } from "react-i18next";
import { useSidebar } from "@/components/ui/sidebar";
import { useTimerMutations } from "@/hooks/mutations/time-entry/use-timer-mutations";
import { useRunningTimer } from "@/hooks/queries/time-entry/use-running-timer";
import useActiveWorkspace from "@/hooks/queries/workspace/use-active-workspace";
import { useElapsed } from "@/hooks/use-elapsed";
import { useStopWithConfirm } from "@/hooks/use-stop-with-confirm";
import { cn } from "@/lib/cn";
import { formatElapsedClock } from "@/lib/format-clock";
import { StopDialog } from "./stop-dialog";
import { TimerButton } from "./timer-button";

/**
 * En movil la barra lateral es un panel que se abre aparte (`Sheet`), asi
 * que el indicador del pie no se ve mientras esta cerrado -que es casi
 * siempre-. Esta pastilla vive fuera de la barra, junto a `<AppSidebar />`
 * en `Layout`, y solo aparece con algo en marcha y el panel cerrado.
 */
export function MobileTimerPill() {
  const { t } = useTranslation();
  const { isMobile, openMobile } = useSidebar();
  const { data: workspace } = useActiveWorkspace();
  const workspaceId = workspace?.id ?? "";
  const { data } = useRunningTimer(workspaceId);
  const { stop, isStopping } = useTimerMutations(workspaceId);

  const running = data?.running;
  const elapsed = useElapsed(running?.startTime);
  const { requestStop, dialogOpen, closeDialog, confirmStop } =
    useStopWithConfirm(stop, elapsed);

  if (!isMobile || openMobile || !workspaceId || !running) {
    return null;
  }

  const loggedTotal = running.loggedBeforeSeconds + elapsed;
  const overEstimate =
    running.task?.estimate != null && loggedTotal > running.task.estimate;

  return (
    <div className="fixed right-4 bottom-4 z-50 transition-[translate,opacity] duration-200 ease-out starting:translate-y-3 starting:opacity-0 motion-reduce:starting:translate-y-0">
      <div
        className={cn(
          "flex items-center gap-2 rounded-full border px-3 py-2 shadow-lg/8",
          overEstimate
            ? "border-warning/30 bg-warning/18 text-warning-foreground"
            : "border-sidebar-accent bg-sidebar-accent text-sidebar-accent-foreground",
        )}
      >
        <span className="size-[7px] shrink-0 rounded-full bg-current motion-safe:animate-pulse" />
        <time className="font-mono text-body tabular-nums">
          {formatElapsedClock(loggedTotal)}
        </time>
        <TimerButton
          running={true}
          onClick={requestStop}
          label={t("timer:stop")}
          variant="plain"
        />
      </div>
      <StopDialog
        open={dialogOpen}
        onClose={closeDialog}
        onConfirm={confirmStop}
        isPending={isStopping}
      />
    </div>
  );
}
