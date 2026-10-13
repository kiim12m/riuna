import { ListTree } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/cn";
import type { TaskSubtree } from "@/types/task";

type SubtaskBadgeProps = {
  subtree: TaskSubtree | null | undefined;
  /**
   * `badge`, con borde, para las tarjetas del tablero; `inline`, solo el icono
   * y la cuenta, junto al titulo en las filas de lista.
   */
  variant?: "badge" | "inline";
  className?: string;
};

/**
 * El contador de la rama: cuantas subtareas hay y cuantas estan cerradas. No
 * se pinta en las hojas —no tienen rama— ni cuando el subarbol solo contiene
 * tareas archivadas, que no cuentan para nada.
 */
export default function SubtaskBadge({
  subtree,
  variant = "badge",
  className,
}: SubtaskBadgeProps) {
  const { t } = useTranslation();

  if (!subtree || subtree.descendantCount === 0) return null;

  const isComplete = subtree.descendantDoneCount === subtree.descendantCount;

  return (
    <span
      title={t("tasks:tree.progressTooltip", {
        done: subtree.descendantDoneCount,
        total: subtree.descendantCount,
      })}
      className={cn(
        "inline-flex flex-shrink-0 items-center gap-1 text-label font-medium tabular-nums",
        variant === "badge" && "rounded border border-border/60 px-1.5 py-0.5",
        isComplete ? "text-success-foreground" : "text-muted-foreground",
        className,
      )}
    >
      <ListTree className="h-3 w-3" />
      {subtree.descendantDoneCount}/{subtree.descendantCount}
    </span>
  );
}
