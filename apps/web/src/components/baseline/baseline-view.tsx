import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { TaskBaseline } from "@/fetchers/task/get-task-baseline";
import { getPriorityLabel } from "@/lib/i18n/domain";

export type BaselineTask = TaskBaseline["removed"][number];
export type BaselineBefore = TaskBaseline["changed"][number]["before"];

/** La linea base de una vista, lista para mirar fila a fila (ADR 085). */
export type ViewBaseline = {
  /** Cuando, para decirlo en el resumen. */
  at: string;
  added: ReadonlySet<string>;
  changed: ReadonlyMap<string, BaselineBefore>;
  removed: BaselineTask[];
};

export function toViewBaseline(data: TaskBaseline): ViewBaseline {
  return {
    at: data.at,
    added: new Set(data.added),
    changed: new Map(data.changed.map((entry) => [entry.id, entry.before])),
    removed: data.removed,
  };
}

/** Si la fila entro o cambio desde la linea base: `+` o `●` ante el titulo. */
export function BaselineMark({
  baseline,
  taskId,
}: {
  baseline: ViewBaseline | null | undefined;
  taskId: string;
}) {
  const { t } = useTranslation();
  if (!baseline) return null;
  if (baseline.added.has(taskId)) {
    return (
      <span
        className="mr-1 font-semibold text-success-foreground"
        title={t("tasks:baseline.added")}
        data-testid="baseline-added"
      >
        +
      </span>
    );
  }
  if (baseline.changed.has(taskId)) {
    return (
      <span
        className="mr-1 text-warning-foreground"
        title={t("tasks:baseline.changed")}
        data-testid="baseline-changed"
      >
        ●
      </span>
    );
  }
  return null;
}

/** El valor de entonces, tachado, delante del de ahora. */
export function Was({ children }: { children: ReactNode }) {
  return (
    <s
      className="mr-1.5 text-muted-foreground decoration-muted-foreground/70"
      data-testid="baseline-was"
    >
      {children}
    </s>
  );
}

/** Lo que casaba entonces y ya no: al final, en gris y con sus valores. */
export function RemovedRows({
  removed,
  statusName,
  memberName,
  formatDate,
}: {
  removed: BaselineTask[];
  statusName: (slug: string) => string;
  memberName: (id: string | null) => string;
  formatDate: (value: string | null) => string;
}) {
  const { t } = useTranslation();
  if (removed.length === 0) return null;

  return (
    <div
      className="border-border/60 border-t bg-muted/30 text-muted-foreground"
      data-testid="baseline-removed"
    >
      <p className="px-3 pt-2 pb-1 font-medium text-xs">
        {t("tasks:baseline.removedTitle", { count: removed.length })}
      </p>
      <table className="w-full border-collapse text-xs">
        <tbody>
          {removed.map((task) => (
            <tr key={task.id} className="border-border/40 border-t">
              <td className="px-3 py-1.5">
                <span className="mr-1 font-semibold" aria-hidden="true">
                  −
                </span>
                <s>{task.title}</s>
              </td>
              <td className="px-3 py-1.5">{statusName(task.status)}</td>
              <td className="px-3 py-1.5">{getPriorityLabel(task.priority)}</td>
              <td className="px-3 py-1.5">{memberName(task.userId)}</td>
              <td className="px-3 py-1.5">{formatDate(task.dueDate)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** «Desde el lunes 12: 3 entran · 1 sale · 5 cambian». */
export function BaselineSummary({ baseline }: { baseline: ViewBaseline }) {
  const { t, i18n } = useTranslation();
  const since = new Date(baseline.at).toLocaleDateString(i18n.language, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <p
      className="border-border/60 border-b px-3 py-1.5 text-muted-foreground text-xs"
      data-testid="baseline-summary"
    >
      {t("tasks:baseline.summary", {
        since,
        added: baseline.added.size,
        removed: baseline.removed.length,
        changed: baseline.changed.size,
      })}
    </p>
  );
}
