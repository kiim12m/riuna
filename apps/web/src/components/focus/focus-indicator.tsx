import { useNavigate } from "@tanstack/react-router";
import { Crosshair } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import useActiveWorkspace from "@/hooks/queries/workspace/use-active-workspace";
import { cn } from "@/lib/cn";
import { elapsedMs, isBreak, remainingMs } from "@/lib/focus/machine";
import { formatElapsedClock } from "@/lib/format-clock";
import { useFocusStore } from "@/store/focus";

/**
 * La fase del modo foco en el pie de la barra lateral (ADR 056): con la
 * pantalla de foco cerrada, la sesion sigue y aqui se ve. Pulsarla vuelve a
 * ella.
 */
export function FocusIndicator() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: workspace } = useActiveWorkspace();
  const session = useFocusStore((state) => state.session);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!session) return;
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [session]);

  if (!session || !workspace) return null;

  const remaining = remainingMs(session, now);
  const showClock = session.phase === "work" || isBreak(session.phase);

  return (
    <button
      type="button"
      data-testid="focus-indicator"
      onClick={() =>
        navigate({
          to: "/dashboard/workspace/$workspaceId/focus/$taskId",
          params: { workspaceId: workspace.id, taskId: session.taskId },
        })
      }
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-meta hover:bg-sidebar-accent group-data-[collapsible=icon]:justify-center",
        isBreak(session.phase) ? "text-success-foreground" : "text-brand",
      )}
    >
      <Crosshair className="size-3.5 shrink-0" />
      <span className="min-w-0 flex-1 truncate group-data-[collapsible=icon]:hidden">
        {t(`focus:phase.${session.phase}`)}
      </span>
      {showClock && (
        <span className="font-mono tabular-nums group-data-[collapsible=icon]:hidden">
          {formatElapsedClock(
            Math.round((remaining ?? elapsedMs(session, now)) / 1000),
          )}
        </span>
      )}
    </button>
  );
}
