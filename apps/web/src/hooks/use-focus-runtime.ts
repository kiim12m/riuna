import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useTimerMutations } from "@/hooks/mutations/time-entry/use-timer-mutations";
import { useRunningTimer } from "@/hooks/queries/time-entry/use-running-timer";
import {
  markFired,
  readFired,
  showBrowserNotification,
  withSingleTab,
} from "@/lib/browser-notify";
import {
  advance,
  type FocusSession,
  isBreak,
  phaseEndsAt,
} from "@/lib/focus/machine";
import { toast } from "@/lib/toast";
import { useFocusStore } from "@/store/focus";

/**
 * Un bloque recien empezado se deja en paz un rato: puede que el cronometro
 * que arranco aun no haya llegado a su consulta.
 */
const AUTHORITY_GRACE_MS = 15 * 1000;

/**
 * Lo que el modo foco hace solo (ADR 056), en cualquier pantalla: al acabar
 * un bloque de trabajo para el cronometro y avisa del descanso; al acabar el
 * descanso, avisa. Una sola pestaña actua, con el mismo cerrojo y las mismas
 * claves que los avisos de la hora anclada (ADR 055).
 *
 * El cronometro del servidor manda: si en pleno bloque de trabajo deja de
 * correr en esta tarea -se paro en otra pestaña, en el movil, desde MCP-, la
 * sesion de foco se acaba aqui tambien.
 */
export function useFocusRuntime(workspaceId: string) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const session = useFocusStore((state) => state.session);
  const setSession = useFocusStore((state) => state.setSession);
  const clear = useFocusStore((state) => state.clear);
  const { stop } = useTimerMutations(workspaceId);
  const { data: timer } = useRunningTimer(workspaceId);

  useEffect(() => {
    if (!session) return;
    const ends = phaseEndsAt(session);
    if (ends === null) return;

    const announce = (next: FocusSession) => {
      const title = t(
        next.phase === "done"
          ? "focus:notify.doneTitle"
          : isBreak(next.phase)
            ? "focus:notify.breakTitle"
            : "focus:notify.readyTitle",
      );
      const body =
        isBreak(next.phase) && next.phaseDurationMs !== null
          ? t("focus:notify.breakBody", {
              minutes: Math.round(next.phaseDurationMs / 60000),
            })
          : t("focus:notify.readyBody");
      toast.info(title);
      showBrowserNotification({
        title,
        body,
        tag: `focus:${next.phaseStartedAt}`,
        onClick: () =>
          navigate({
            to: "/dashboard/workspace/$workspaceId/focus/$taskId",
            params: { workspaceId, taskId: next.taskId },
          }),
      });
    };

    const timeout = window.setTimeout(
      () => {
        void withSingleTab("riuna:focus", () => {
          const current = useFocusStore.getState().session;
          if (!current) return;
          const next = advance(current, Date.now());
          if (next === current) return;
          const key = `focus:${current.phase}:${current.phaseStartedAt}`;
          if (readFired().has(key)) return;
          markFired(key);

          setSession(next);
          // Los descansos no registran tiempo: el bloque que acaba para el
          // cronometro.
          if (current.phase === "work") stop();
          announce(next);
        });
      },
      Math.max(0, ends - Date.now()) + 250,
    );

    return () => window.clearTimeout(timeout);
  }, [session, setSession, stop, navigate, t, workspaceId]);

  useEffect(() => {
    if (session?.phase !== "work" || !timer) return;
    if (Date.now() - session.phaseStartedAt < AUTHORITY_GRACE_MS) return;
    if (timer.running?.task.id !== session.taskId) {
      clear();
      toast.info(t("focus:stoppedOutside"));
    }
  }, [session, timer, clear, t]);
}
