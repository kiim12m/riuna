import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { QuickAddDialog } from "@/components/quick-add/quick-add-dialog";
import { ReminderDialog } from "@/components/reminders/reminder-dialog";
import { StopDialog } from "@/components/timer/stop-dialog";
import { shortcuts } from "@/constants/shortcuts";
import { useTimerMutations } from "@/hooks/mutations/time-entry/use-timer-mutations";
import { useRunningTimer } from "@/hooks/queries/time-entry/use-running-timer";
import useActiveWorkspace from "@/hooks/queries/workspace/use-active-workspace";
import { useAnchorReminders } from "@/hooks/use-anchor-reminders";
import { useElapsed } from "@/hooks/use-elapsed";
import { useEstimateWarning } from "@/hooks/use-estimate-warning";
import { useFocusRuntime } from "@/hooks/use-focus-runtime";
import { useRegisterShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { useStopWithConfirm } from "@/hooks/use-stop-with-confirm";
import { useTimerTitle } from "@/hooks/use-timer-title";
import { useUserWebSocket } from "@/hooks/use-user-websocket";
import { useWorkdayNudges } from "@/hooks/use-workday-nudges";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { formatElapsedClock } from "@/lib/format-clock";
import { useQuickAddStore } from "@/store/quick-add";

/**
 * Lo que tiene que seguir vivo mientras se navega por el panel, montado una
 * sola vez en la ruta `dashboard` (ADR 048).
 *
 * Antes vivia repartido por la barra lateral -la conexion del canal de
 * usuario en el selector de espacio; el titulo con el reloj, el aviso de
 * estimacion superada y Ctrl+E en el pie- y cada ruta monta su propio
 * `<Layout>`, asi que todo se desmontaba y volvia a montar en cada cambio de
 * pantalla: el socket se reconectaba, y en movil, donde la barra es un panel
 * que solo existe abierto, no habia conexion ni atajo casi nunca. Los ajustes
 * de cuenta, que no tienen barra, tampoco los tenian.
 *
 * No pinta nada salvo dos dialogos: el de parar -Ctrl+E sobre una entrada de
 * mas de diez horas pregunta la hora real de fin (`useStopWithConfirm`), y
 * ese dialogo tiene que existir aunque la barra no este montada- y el de
 * captura rapida que abre `q`.
 */
export function WorkspaceRuntime() {
  useUserWebSocket();

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
  const { requestStop, dialogOpen, closeDialog, confirmStop } =
    useStopWithConfirm(stop, elapsed);

  useTimerTitle(running ? formatElapsedClock(loggedTotal) : undefined);
  useAnchorReminders(workspaceId);
  useFocusRuntime(workspaceId);
  useWorkdayNudges(workspaceId);
  useEstimateWarning(
    running?.id,
    overEstimate,
    t("timer:overEstimate", {
      title: running?.task?.title ?? t("timer:untitledTask"),
    }),
  );

  // Igual que `kb.togglePlay` de super-productivity: para si hay algo en
  // marcha, reanuda la ultima si no.
  const toggle = useCallback(() => {
    if (running) {
      requestStop();
      return;
    }
    if (last) {
      start({
        id: last.taskId,
        number: last.taskNumber,
        title: last.taskTitle,
        projectId: last.projectId,
        estimate: null,
      });
    }
  }, [running, last, start, requestStop]);

  // `q`, la captura rapida (ADR 052), en cualquier pantalla. Comodidad, no
  // autorizacion: `POST /capture` exige `task:create` igual.
  const { canCreateTasks } = useWorkspacePermission();
  const openQuickAdd = useQuickAddStore((state) => state.setOpen);
  const canCapture = Boolean(workspaceId) && canCreateTasks();

  useRegisterShortcuts({
    modifierShortcuts: {
      [shortcuts.timer.prefix]: {
        [shortcuts.timer.toggle]: toggle,
      },
    },
  });

  useRegisterShortcuts(
    useMemo(
      () =>
        canCapture
          ? {
              shortcuts: { [shortcuts.quickAdd.key]: () => openQuickAdd(true) },
            }
          : {},
      [canCapture, openQuickAdd],
    ),
  );

  return (
    <>
      <StopDialog
        open={dialogOpen}
        onClose={closeDialog}
        onConfirm={confirmStop}
        isPending={isStopping}
      />
      <QuickAddDialog workspaceId={workspaceId} />
      <ReminderDialog workspaceId={workspaceId} />
    </>
  );
}
