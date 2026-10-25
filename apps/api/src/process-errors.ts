import { log } from "./utils/log";

/**
 * Un rechazo que nadie espera —un `void` sobre una promesa que falla— se
 * anota y se sigue: en Node 24 tumbaba la API entera por un aviso que no llego.
 */
export function handleUnhandledRejection(reason: unknown) {
  log.error("Unhandled promise rejection:", reason);
}

/**
 * Una excepcion sin capturar si deja el proceso en un estado que no se conoce:
 * se anota y se sale con 1, y Docker lo vuelve a levantar.
 */
export function handleUncaughtException(
  error: unknown,
  exit: (code: number) => void = (code) => process.exit(code),
) {
  log.error("Uncaught exception, exiting:", error);
  exit(1);
}

/** Los registra en el proceso (solo al arrancar el servidor). */
export function installProcessErrorHandlers() {
  const onRejection = (reason: unknown) => handleUnhandledRejection(reason);
  const onException = (error: unknown) => handleUncaughtException(error);
  process.on("unhandledRejection", onRejection);
  process.on("uncaughtException", onException);
  return () => {
    process.off("unhandledRejection", onRejection);
    process.off("uncaughtException", onException);
  };
}
