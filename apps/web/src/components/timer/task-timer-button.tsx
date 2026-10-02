import { useTranslation } from "react-i18next";
import { useTimerMutations } from "@/hooks/mutations/time-entry/use-timer-mutations";
import { useRunningTimer } from "@/hooks/queries/time-entry/use-running-timer";
import useActiveWorkspace from "@/hooks/queries/workspace/use-active-workspace";
import { useElapsed } from "@/hooks/use-elapsed";
import { useStopWithConfirm } from "@/hooks/use-stop-with-confirm";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { cn } from "@/lib/cn";
import { StopDialog } from "./stop-dialog";
import { TimerButton } from "./timer-button";

type TimerTask = {
  id: string;
  number: number | null;
  title: string;
  projectId: string;
  estimate: number | null;
  isDone?: boolean;
};

type TaskTimerButtonProps = {
  task: TimerTask;
  /**
   * `hover`: en escritorio solo aparece al pasar el puntero por la fila
   * -`group` en un antecesor- o con el foco; en marcha y en pantallas
   * tactiles se ve siempre. `always`: siempre.
   */
  reveal?: "always" | "hover";
  className?: string;
};

/**
 * Arrancar o parar el cronometro de **una** tarea desde cualquier sitio que la
 * pinte: el detalle, el Planificador, el Cronograma, Mis tareas, el tablero.
 * Hasta ahora solo se podia desde Hoy (ADR 044), y el resto de pantallas no
 * tenia forma de empezar a registrar.
 *
 * Lee el cronometro en marcha por su cuenta -una sola consulta en cache para
 * toda la pagina- en vez de recibirlo de quien la pinta, para poder soltarse
 * en cualquier fila sin cablear nada. El dialogo de parada larga solo se
 * monta en el boton de la tarea que corre: con cincuenta tarjetas en el
 * Planificador no hay cincuenta dialogos cerrados.
 *
 * Vive dentro de filas que se abren o se arrastran al pulsarlas, asi que
 * corta `pointerdown` y las teclas ademas del clic, igual que
 * `InlineEstimate`.
 */
export function TaskTimerButton({
  task,
  reveal = "always",
  className,
}: TaskTimerButtonProps) {
  const { t } = useTranslation();
  const { data: workspace } = useActiveWorkspace();
  const workspaceId = workspace?.id ?? "";
  const { data } = useRunningTimer(workspaceId);
  const { start, stop, isStopping } = useTimerMutations(workspaceId);
  const { canUpdateTasks } = useWorkspacePermission();

  const running = data?.running;
  const isRunningThis = running?.task?.id === task.id;
  const elapsed = useElapsed(isRunningThis ? running?.startTime : undefined);
  const { requestStop, dialogOpen, closeDialog, confirmStop } =
    useStopWithConfirm(stop, elapsed);

  // Arrancar pide `task:update` en la API (`POST /time-entry/start`): sin el,
  // el boton solo prometeria un 403. Parar lo propio, en cambio, siempre.
  if (!workspaceId || (!isRunningThis && !canUpdateTasks())) return null;

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: solo corta la propagacion hacia la fila; el control es el boton de dentro
    <span
      className={cn(
        "inline-flex shrink-0",
        reveal === "hover" &&
          !isRunningThis &&
          "opacity-0 transition-opacity duration-(--motion-fast) focus-within:opacity-100 group-hover:opacity-100 touch:opacity-100",
        className,
      )}
      // El dialogo de parada va en un portal, pero sus eventos suben por el
      // arbol de React: sin cortar tambien el clic, confirmar la hora de fin
      // abriria la tarea de la fila.
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <TimerButton
        running={isRunningThis}
        disabled={!isRunningThis && task.isDone}
        label={t(isRunningThis ? "timer:stop" : "timer:start")}
        onClick={() => {
          if (isRunningThis) {
            requestStop();
            return;
          }
          start({
            id: task.id,
            number: task.number,
            title: task.title,
            projectId: task.projectId,
            estimate: task.estimate,
          });
        }}
      />
      {isRunningThis && (
        <StopDialog
          open={dialogOpen}
          onClose={closeDialog}
          onConfirm={confirmStop}
          isPending={isStopping}
        />
      )}
    </span>
  );
}
