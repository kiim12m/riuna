import type { NudgePreferences } from "@/lib/reminders/workday-nudges";

/**
 * Avisos del navegador (ADR 055), sin service worker ni push: solo suenan con
 * una pestaña de Riuna abierta. Todo lo que recuerda -si estan activados, que
 * se ha avisado ya, que se ha pospuesto- vive en `localStorage`, que es de
 * este navegador y lo comparten sus pestañas. Si no se puede leer o escribir
 * (navegacion privada, almacenamiento bloqueado), se comporta como vacio.
 */

const ENABLED_KEY = "riuna:browser-notify:enabled";
const FIRED_KEY = "riuna:reminders:fired";
const SNOOZED_KEY = "riuna:reminders:snoozed";
const NUDGES_KEY = "riuna:nudges";
/** Lo avisado se olvida a los dos dias: las claves llevan su fecha. */
const KEEP_MS = 2 * 24 * 60 * 60 * 1000;

function read<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Sin almacenamiento solo se pierde el recuerdo: puede repetirse un aviso.
  }
}

export function notificationsSupported() {
  return typeof window !== "undefined" && "Notification" in window;
}

export function notificationPermission():
  | NotificationPermission
  | "unsupported" {
  return notificationsSupported() ? Notification.permission : "unsupported";
}

/** Activados aqui y con permiso del navegador: las dos cosas. */
export function browserNotifyEnabled() {
  return (
    notificationPermission() === "granted" && read<boolean>(ENABLED_KEY, false)
  );
}

/** Pide permiso si hace falta; solo queda activado si el navegador lo da. */
export async function enableBrowserNotify() {
  if (!notificationsSupported()) return "unsupported" as const;
  const permission =
    Notification.permission === "granted"
      ? "granted"
      : await Notification.requestPermission();
  write(ENABLED_KEY, permission === "granted");
  return permission;
}

export function disableBrowserNotify() {
  write(ENABLED_KEY, false);
}

/** Lo ya avisado, con cuando: los avisos de ritmo miran la ultima vez. */
export function readFiredTimes(now = Date.now()): Record<string, number> {
  const fired = read<Record<string, number>>(FIRED_KEY, {});
  return Object.fromEntries(
    Object.entries(fired).filter(([, at]) => now - at < KEEP_MS),
  );
}

export function readFired(now = Date.now()): Set<string> {
  return new Set(Object.keys(readFiredTimes(now)));
}

export function markFired(key: string, now = Date.now()) {
  const fired = read<Record<string, number>>(FIRED_KEY, {});
  const kept = Object.fromEntries(
    Object.entries(fired).filter(([, at]) => now - at < KEEP_MS),
  );
  write(FIRED_KEY, { ...kept, [key]: now });
}

/** Posponer vale para este navegador: se guarda aqui, no en la API. */
export function readSnoozes(): Record<string, number> {
  return read<Record<string, number>>(SNOOZED_KEY, {});
}

export function snoozeUntil(taskId: string, until: number) {
  write(SNOOZED_KEY, { ...readSnoozes(), [taskId]: until });
}

/**
 * Que avisos de ritmo quiere este navegador (ADR 056). Ninguno por defecto:
 * activar los avisos del navegador es para la hora anclada, y los de ritmo
 * se piden uno a uno.
 */
export function readNudgePreferences(): NudgePreferences {
  return {
    break: false,
    idle: false,
    overtime: false,
    ...read<Partial<NudgePreferences>>(NUDGES_KEY, {}),
  };
}

export function writeNudgePreferences(preferences: NudgePreferences) {
  write(NUDGES_KEY, preferences);
}

/**
 * Ejecuta `run` en una sola pestaña a la vez. Con varias abiertas, todas
 * hacen su tic, pero solo la que consigue el cerrojo avisa; las demas ven
 * despues la clave ya marcada. Sin `navigator.locks`, cada pestaña por su
 * cuenta: la clave en `localStorage` sigue evitando casi todas las repeticiones,
 * y el `tag` de la notificacion colapsa las que se cuelen.
 */
export async function withSingleTab(name: string, run: () => void) {
  const locks = typeof navigator === "undefined" ? undefined : navigator.locks;
  if (!locks?.request) {
    run();
    return;
  }
  await locks.request(name, { ifAvailable: true }, async (lock) => {
    if (lock) run();
  });
}

export function showBrowserNotification({
  title,
  body,
  tag,
  onClick,
}: {
  title: string;
  body: string;
  tag: string;
  onClick: () => void;
}) {
  if (!browserNotifyEnabled()) return null;
  const notification = new Notification(title, { body, tag });
  // Sin service worker no hay botones en la notificacion: pulsarla trae la
  // pestaña delante y alli se decide.
  notification.onclick = () => {
    window.focus();
    onClick();
    notification.close();
  };
  return notification;
}
