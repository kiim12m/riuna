import type { TFunction } from "i18next";
import { CircleHelp } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/cn";
import { type FormulaField, formulaToDisplay } from "@/lib/formula-text";

export type HelpfulField = {
  name: string;
  type: string;
  description?: string | null;
  config?: Record<string, unknown>;
};

/** La formula de un campo calculado tal como se lee, o nada. */
export function formulaDisplayOf(
  definition: HelpfulField,
  fields: FormulaField[],
  t: TFunction,
) {
  return definition.type === "formula" &&
    typeof definition.config?.expression === "string"
    ? formulaToDisplay(definition.config.expression, fields, {
        estimate: t("tasks:fields.formula.estimate"),
        logged: t("tasks:fields.formula.logged"),
      })
    : null;
}

/**
 * El «?» que acompana al nombre de un campo en el detalle, la Tabla y el
 * importador (ADR 090): su texto de ayuda y, si es calculado, su formula. Sin
 * ninguna de las dos cosas no pinta nada.
 */
export default function FieldHelp({
  definition,
  fields,
  className,
}: {
  definition: HelpfulField;
  /** Los campos del proyecto, para escribir la formula con sus nombres. */
  fields: FormulaField[];
  className?: string;
}) {
  const { t } = useTranslation();
  const formula = formulaDisplayOf(definition, fields, t);
  const help = definition.description?.trim();

  if (!help && !formula) return null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={t("tasks:fields.help", { name: definition.name })}
          // Dentro de la cabecera de la Tabla, pulsarlo no tiene que ordenar.
          onClick={(event) => event.stopPropagation()}
          className={cn(
            "inline-flex shrink-0 cursor-help items-center text-muted-foreground/70 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/70",
            className,
          )}
        >
          <CircleHelp className="size-3" />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-72">
        <div className="space-y-1 py-0.5 text-xs">
          {help && <p className="whitespace-pre-line">{help}</p>}
          {formula && (
            <p className="text-muted-foreground">
              {t("tasks:fields.formula.calculatedAs", { formula })}
            </p>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
