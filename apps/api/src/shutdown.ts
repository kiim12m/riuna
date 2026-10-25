import { closeDatabasePool } from "./database";
import { settleEvents } from "./events";
import { shutdownScheduler } from "./scheduler";
import { log } from "./utils/log";
import { closeLocalConnections, shutdownWebSocketAdapter } from "./ws";

type ClosableServer = {
  close: (callback: () => void) => unknown;
  closeAllConnections?: () => void;
};

/** `true` si la promesa acaba antes del plazo; si no, se deja de esperarla. */
async function withinDeadline(work: Promise<unknown>, deadline: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<false>((resolve) => {
    timer = setTimeout(
      () => resolve(false),
      Math.max(0, deadline - Date.now()),
    );
  });
  try {
    return await Promise.race([work.then(() => true as const), expired]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Apaga la API sin cortar lo que estaba a medias (auditoria 1.4): deja de
 * aceptar peticiones y espera a las que estan en curso, al trabajo programado
 * que este corriendo y a los gestores de eventos que todo eso haya lanzado, y
 * solo entonces cierra Redis y el pool. Todo con un plazo: pasado, se fuerza.
 *
 * Los sockets se cierran primero, con 1001: el navegador se reconecta a la
 * instancia nueva, y sin cerrarlos `server.close` esperaria a cada uno.
 */
export async function gracefulShutdown({
  server,
  timeoutMs = 10_000,
}: {
  server: ClosableServer;
  timeoutMs?: number;
}) {
  const deadline = Date.now() + timeoutMs;

  closeLocalConnections();
  const closed = new Promise<void>((resolve) => server.close(() => resolve()));
  if (!(await withinDeadline(closed, deadline))) {
    log.warn("Shutdown deadline reached with requests still open");
    server.closeAllConnections?.();
  }

  if (!(await withinDeadline(shutdownScheduler(), deadline))) {
    log.warn("Shutdown deadline reached with a scheduled job still running");
  }
  if (!(await withinDeadline(settleEvents(), deadline))) {
    log.warn("Shutdown deadline reached with event handlers still running");
  }

  await shutdownWebSocketAdapter();
  await closeDatabasePool();
}
