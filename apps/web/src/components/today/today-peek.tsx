import { Maximize2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ProjectPill } from "@/components/task/project-pill";
import { Button } from "@/components/ui/button";
import type { TodayEntry, TodayTask, TodayUrgent } from "@/fetchers/today";
import { formatDuration } from "@/lib/duration";
import { formatDate } from "@/lib/format";
import { getPriorityIcon } from "@/lib/priority";

type PeekTask = TodayEntry | TodayUrgent | TodayTask;

/**
 * El resumen fijo a la derecha de Hoy (`barra-lateral.html`): lo que hace
 * falta para decidir que hacer con una tarea sin salir de la lista. Todo sale
 * de `GET /today`, que ya trae estado, prioridad, estimacion y vencimiento; el
 * detalle completo sigue siendo `TaskDetailsSheet`, a un clic.
 */
export function TodayPeek({
  task,
  runningSeconds,
  onOpenDetails,
}: {
  task: PeekTask;
  /** Lo que lleva el cronometro si esta en marcha sobre esta tarea; 0 si no. */
  runningSeconds: number;
  onOpenDetails: () => void;
}) {
  const { t, i18n } = useTranslation();
  const none = "—";
  // "Vence hoy o vencida" no trae lo registrado: no esta en el plan, y
  // `GET /today` solo lo suma para lo planificado y lo hecho.
  const logged =
    ("loggedSeconds" in task ? task.loggedSeconds : 0) + runningSeconds;

  return (
    <aside
      aria-label={t("today:peek.label")}
      className="sticky top-4 w-60 shrink-0 overflow-hidden rounded-md border border-border"
    >
      <header className="flex items-center justify-between gap-2 border-border border-b py-1 ps-2.5 pe-1">
        <span className="font-mono text-meta text-muted-foreground">
          {task.projectSlug}-{task.number}
        </span>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={onOpenDetails}
          aria-label={t("today:peek.open")}
          title={t("today:peek.open")}
        >
          <Maximize2 />
        </Button>
      </header>

      <div className="space-y-2.5 p-2.5">
        <h2 className="text-balance font-semibold text-body">{task.title}</h2>
        <dl className="grid grid-cols-[auto_1fr] items-center gap-x-2.5 gap-y-1.5 text-meta">
          <dt className="text-muted-foreground">{t("today:peek.project")}</dt>
          <dd className="min-w-0">
            <ProjectPill name={task.projectName} icon={task.projectIcon} />
          </dd>

          <dt className="text-muted-foreground">{t("today:peek.status")}</dt>
          <dd className="truncate">{task.statusColumn?.name ?? task.status}</dd>

          <dt className="text-muted-foreground">{t("today:peek.priority")}</dt>
          <dd className="flex items-center gap-1">
            {getPriorityIcon(task.priority)}
            {t(`tasks:priority.${task.priority}`)}
          </dd>

          <dt className="text-muted-foreground">{t("today:peek.estimate")}</dt>
          <dd className="font-mono tabular-nums">
            {task.estimate
              ? formatDuration(task.estimate, i18n.language)
              : none}
          </dd>

          <dt className="text-muted-foreground">{t("today:peek.logged")}</dt>
          <dd className="font-mono tabular-nums">
            {logged > 0 ? formatDuration(logged, i18n.language) : none}
          </dd>

          <dt className="text-muted-foreground">{t("today:peek.due")}</dt>
          <dd>
            {task.dueDate
              ? formatDate(task.dueDate, {
                  weekday: "short",
                  day: "numeric",
                  month: "short",
                })
              : none}
          </dd>
        </dl>
      </div>
    </aside>
  );
}
