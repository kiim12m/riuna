import { Link } from "@tanstack/react-router";
import { Play } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useTimerMutations } from "@/hooks/mutations/time-entry/use-timer-mutations";
import { useRunningTimer } from "@/hooks/queries/time-entry/use-running-timer";
import useActiveWorkspace from "@/hooks/queries/workspace/use-active-workspace";
import { useElapsed } from "@/hooks/use-elapsed";
import { useStopWithConfirm } from "@/hooks/use-stop-with-confirm";
import { cn } from "@/lib/cn";
import { formatElapsedClock } from "@/lib/format-clock";
import { StopDialog } from "./stop-dialog";
import { TimerButton } from "./timer-button";

const ROW_CLASS =
  "flex items-center gap-2 rounded-md px-2 py-1.5 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0";

/**
 * El indicador de cronometro del pie de la barra lateral -no una cabecera:
 * la ADR 022 ya maqueto y descarto esa variante (plan.md, interludio)-. Sin
 * nada en marcha ofrece "Reanudar" sobre la ultima tarea sin terminar, como
 * el play de la cabecera de super-productivity.
 *
 * El titulo va en su propio `<Link>` y el boton de parar es un hermano, no
 * un hijo suyo: un `<button>` dentro de un `<a>` es contenido interactivo
 * anidado, invalido en HTML y confuso para un lector de pantalla.
 *
 * Solo pinta: el reloj en el titulo de la pestana, el aviso de estimacion
 * superada y Ctrl+E viven en `WorkspaceRuntime`, que no se desmonta al
 * cambiar de pantalla ni al cerrar el panel movil (ADR 048).
 */
export function SidebarTimer() {
  const { t } = useTranslation();
  const { data: workspace } = useActiveWorkspace();
  const workspaceId = workspace?.id ?? "";
  const { data } = useRunningTimer(workspaceId);
  const { start, stop, isStopping } = useTimerMutations(workspaceId);

  const running = data?.running;
  const last = data?.last;
  const elapsed = useElapsed(running?.startTime);
  const loggedTotal = running ? running.loggedBeforeSeconds + elapsed : 0;
  const overEstimate = Boolean(
    running?.task?.estimate != null && loggedTotal > running.task.estimate,
  );
  const taskTitle = running?.task?.title ?? t("timer:untitledTask");
  const { requestStop, dialogOpen, closeDialog, confirmStop } =
    useStopWithConfirm(stop, elapsed);

  if (!workspaceId || (!running && !last)) {
    return null;
  }

  if (!running) {
    if (!last) return null;

    return (
      <button
        type="button"
        onClick={() =>
          start({
            id: last.taskId,
            number: last.taskNumber,
            title: last.taskTitle,
            projectId: last.projectId,
            estimate: null,
          })
        }
        // En raíl el texto se oculta y solo queda el icono: sin esto se
        // quedaria sin nombre accesible.
        aria-label={t("timer:resumeTask", { title: last.taskTitle })}
        title={t("timer:resumeTask", { title: last.taskTitle })}
        className={cn(
          ROW_CLASS,
          "bg-sidebar-accent text-sidebar-accent-foreground hover:brightness-105",
        )}
      >
        <Play
          className="size-3.5 shrink-0"
          fill="currentColor"
          strokeWidth={0}
        />
        <span className="min-w-0 flex-1 truncate text-left text-body font-medium group-data-[collapsible=icon]:hidden">
          {t("timer:resumeTask", { title: last.taskTitle })}
        </span>
      </button>
    );
  }

  return (
    <div
      className={cn(
        ROW_CLASS,
        overEstimate
          ? "bg-warning/18 text-warning-foreground"
          : "bg-sidebar-accent text-sidebar-accent-foreground",
      )}
      // El titulo del contenedor es lo unico que llega en rail: el enlace de
      // abajo se oculta ahi y con el se va su propio `title`.
      title={
        overEstimate ? t("timer:overEstimate", { title: taskTitle }) : taskTitle
      }
    >
      <span className="size-[7px] shrink-0 rounded-full bg-current motion-safe:animate-pulse" />
      {running.task ? (
        <Link
          to="/dashboard/workspace/$workspaceId/project/$projectId/task/$taskId"
          params={{
            workspaceId,
            projectId: running.task.projectId,
            taskId: running.task.id,
          }}
          className="flex min-w-0 flex-1 flex-col leading-tight group-data-[collapsible=icon]:hidden"
          title={
            overEstimate
              ? t("timer:overEstimate", { title: running.task.title })
              : running.task.title
          }
        >
          <span className="truncate text-body font-medium">
            {running.task.title}
          </span>
          <time className="font-mono text-meta tabular-nums">
            {formatElapsedClock(loggedTotal)}
          </time>
        </Link>
      ) : (
        <span className="flex min-w-0 flex-1 flex-col leading-tight group-data-[collapsible=icon]:hidden">
          <span className="truncate text-body font-medium">
            {t("timer:untitledTask")}
          </span>
          <time className="font-mono text-meta tabular-nums">
            {formatElapsedClock(loggedTotal)}
          </time>
        </span>
      )}
      <TimerButton
        running={true}
        onClick={requestStop}
        label={t("timer:stop")}
        variant="plain"
        className="ml-auto group-data-[collapsible=icon]:hidden"
      />
      <StopDialog
        open={dialogOpen}
        onClose={closeDialog}
        onConfirm={confirmStop}
        isPending={isStopping}
      />
    </div>
  );
}
