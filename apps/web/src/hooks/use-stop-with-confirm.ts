import { useState } from "react";

/** Diez horas: mas alla de eso, es un cronometro olvidado y no una jornada real. */
const LONG_RUNNING_THRESHOLD_SECONDS = 10 * 60 * 60;

/**
 * Envuelve `stop()` para que una entrada de mas de diez horas abra
 * `StopDialog` en vez de pararse con "ahora" -que casi seguro seria varias
 * horas tarde-. Comparten esto el pie de la barra y la pastilla movil.
 */
export function useStopWithConfirm(
  stop: (endTime?: string) => void,
  elapsedSeconds: number,
) {
  const [dialogOpen, setDialogOpen] = useState(false);

  const requestStop = () => {
    if (elapsedSeconds > LONG_RUNNING_THRESHOLD_SECONDS) {
      setDialogOpen(true);
      return;
    }
    stop();
  };

  const confirmStop = (endTime: string) => {
    stop(endTime);
    setDialogOpen(false);
  };

  return {
    requestStop,
    dialogOpen,
    closeDialog: () => setDialogOpen(false),
    confirmStop,
  };
}
