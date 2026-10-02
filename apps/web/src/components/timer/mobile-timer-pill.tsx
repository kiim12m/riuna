import { Play } from "lucide-react";
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
 * en `Layout`, y solo aparece con el panel cerrado: con algo en marcha, el
 * reloj y parar; sin nada, un "Reanudar" redondo sobre la ultima tarea sin
 * terminar, como el del pie (ADR 044) -que en movil no se veia nunca-.
 */
export function MobileTimerPill() {
  const { t } = useTranslation();
  const { isMobile, openMobile } = useSidebar();
  const { data: workspace } = useActiveWorkspace();
  const workspaceId = workspace?.id ?? "";
  const { data } = useRunningTimer(workspaceId);
  const { start, stop, isStopping } = useTimerMutations(workspaceId);

  const running = data?.running;
  const last = data?.last;
  // El `setInterval` de `useElapsed` solo arranca si esto es cierto: en
  // escritorio, o con el panel movil abierto, la pastilla nunca se ve, y
  // hasta ahora tickeaba igual sin motivo.
  const visible =
    isMobile && !openMobile && Boolean(workspaceId) && Boolean(running);
  const elapsed = useElapsed(visible ? running?.startTime : undefined);
  const { requestStop, dialogOpen, closeDialog, confirmStop } =
    useStopWithConfirm(stop, elapsed);

  if (isMobile && !openMobile && workspaceId && !running && last) {
    const label = t("timer:resumeTask", { title: last.taskTitle });
    return (
      <div className="fixed right-4 bottom-4 z-50 transition-[translate,opacity] duration-200 ease-out starting:translate-y-3 starting:opacity-0 motion-reduce:starting:translate-y-0">
        <button
          type="button"
          aria-label={label}
          title={label}
          onClick={() =>
            start({
              id: last.taskId,
              number: last.taskNumber,
              title: last.taskTitle,
              projectId: last.projectId,
              estimate: null,
            })
          }
          className="flex size-10 items-center justify-center rounded-full border border-sidebar-accent bg-sidebar-accent text-sidebar-accent-foreground shadow-lg/8"
        >
          <Play className="size-4" fill="currentColor" strokeWidth={0} />
        </button>
      </div>
    );
  }

  if (!visible || !running) {
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
