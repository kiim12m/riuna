import { MoreHorizontal, TriangleAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/menu";
import { Progress } from "@/components/ui/progress";
import type { Goal, GoalTarget } from "@/fetchers/goal";
import { formatDateMedium } from "@/lib/format";

/**
 * Un objetivo con su periodo y sus resultados clave.
 *
 * El progreso que se pinta **no viene guardado**: lo mide el servidor al leer,
 * contra el periodo del objetivo. Por eso no hay ningun boton de "recalcular":
 * cerrar una tarea ya cambia el numero.
 */
export function GoalCard({
  goal,
  onAddTarget,
  onEditTarget,
  onDeleteTarget,
  onEdit,
  onDelete,
  onToggleShare,
}: {
  goal: Goal;
  // Sin acciones, la tarjeta es de solo lectura: es como se ve un objetivo
  // compartido de otra persona, que la API no deja tocar.
  onAddTarget?: () => void;
  onEditTarget?: (target: GoalTarget) => void;
  onDeleteTarget?: (target: GoalTarget) => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onToggleShare?: () => void;
}) {
  const { t, i18n } = useTranslation();

  // El avance del objetivo es la media de sus resultados clave, que es como se
  // lee un OKR: no todos valen lo mismo en importancia, pero ponderarlos pide
  // un peso por resultado que nadie ha pedido todavia.
  const measurable = goal.targets.filter((target) => target.current !== null);
  const overall = measurable.length
    ? Math.round(
        (measurable.reduce(
          (sum, target) =>
            sum + Math.min((target.current ?? 0) / target.targetValue, 1),
          0,
        ) /
          measurable.length) *
          100,
      )
    : null;

  return (
    <section className="space-y-3 rounded-lg border border-border p-4">
      <header className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-section">{goal.name}</h2>
          <p className="text-muted-foreground text-meta">
            {formatDateMedium(goal.startsAt, i18n.language)} —{" "}
            {formatDateMedium(goal.endsAt, i18n.language)}
            {goal.isShared && ` · ${t("goals:shared")}`}
          </p>
        </div>

        {overall !== null && (
          <span className="shrink-0 font-semibold text-lg tabular-nums">
            {overall}%
          </span>
        )}

        {(onAddTarget || onEdit || onToggleShare || onDelete) && (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={t("goals:actions.menu")}
                >
                  <MoreHorizontal />
                </Button>
              }
            />
            <DropdownMenuContent align="end" className="w-44">
              {onAddTarget && (
                <DropdownMenuItem onClick={onAddTarget}>
                  {t("goals:actions.addTarget")}
                </DropdownMenuItem>
              )}
              {onEdit && (
                <DropdownMenuItem onClick={onEdit}>
                  {t("common:actions.edit")}
                </DropdownMenuItem>
              )}
              {onToggleShare && (
                <DropdownMenuItem onClick={onToggleShare}>
                  {goal.isShared
                    ? t("goals:actions.unshare")
                    : t("goals:actions.share")}
                </DropdownMenuItem>
              )}
              {onDelete && (
                <DropdownMenuItem variant="destructive" onClick={onDelete}>
                  {t("common:actions.delete")}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </header>

      {goal.description && (
        <p className="text-muted-foreground text-meta">{goal.description}</p>
      )}

      {goal.targets.length === 0 ? (
        <p className="py-2 text-muted-foreground text-meta">
          {t("goals:empty.noTargets")}
        </p>
      ) : (
        <ul className="space-y-3">
          {goal.targets.map((target) => (
            <li key={target.id}>
              <TargetRow
                target={target}
                onEdit={onEditTarget && (() => onEditTarget(target))}
                onDelete={onDeleteTarget && (() => onDeleteTarget(target))}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function TargetRow({
  target,
  onEdit,
  onDelete,
}: {
  target: GoalTarget;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const { t } = useTranslation();
  const failed = target.current === null;
  const percent = failed
    ? 0
    : Math.min(
        Math.round(((target.current ?? 0) / target.targetValue) * 100),
        100,
      );

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline gap-2">
        <span className="min-w-0 flex-1 truncate text-body">{target.name}</span>

        {failed ? (
          // Un resultado que no se puede medir lo dice, y no tumba el objetivo.
          <span className="flex shrink-0 items-center gap-1 text-meta text-warning-foreground">
            <TriangleAlert className="size-3.5" />
            {t("goals:target.unmeasurable")}
          </span>
        ) : (
          <span className="shrink-0 text-meta tabular-nums">
            {t("goals:target.progress", {
              current: target.current,
              target: target.targetValue,
            })}
          </span>
        )}

        {(onEdit || onDelete) && (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={t("goals:actions.targetMenu")}
                >
                  <MoreHorizontal />
                </Button>
              }
            />
            <DropdownMenuContent align="end" className="w-40">
              {onEdit && (
                <DropdownMenuItem onClick={onEdit}>
                  {t("common:actions.edit")}
                </DropdownMenuItem>
              )}
              {onDelete && (
                <DropdownMenuItem variant="destructive" onClick={onDelete}>
                  {t("common:actions.delete")}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {!failed && <Progress value={percent} className="h-1.5" />}
    </div>
  );
}
