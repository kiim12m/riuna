import { Plus, X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { parseLocaleNumber } from "@/lib/parse-locale-number";
import {
  type EditableCondition,
  type FilterableField,
  type FilterOperator,
  OPERATORS_BY_TYPE,
  operatorTakesValue,
} from "@/types/task-filter";

const TREE_MODES = ["tree", "flat", "roots", "withDescendants"] as const;
export type TreeMode = (typeof TREE_MODES)[number];

type Props = {
  fields: FilterableField[];
  conditions: EditableCondition[];
  onChange: (conditions: EditableCondition[]) => void;
  // El modo de jerarquia es propio de la vista Tabla: un calendario no anida
  // nada, asi que alli el selector no se pinta.
  treeMode?: TreeMode;
  onTreeModeChange?: (mode: TreeMode) => void;
};

function defaultOperatorFor(field: FilterableField): FilterOperator {
  return OPERATORS_BY_TYPE[field.valueType][0] ?? "eq";
}

/**
 * Las condiciones se combinan con Y. El motor entiende tambien O y negacion;
 * ofrecerlos aqui es interfaz que todavia no hace falta, y una barra que pida
 * elegir el conector antes de escribir la primera condicion se usa peor.
 */
function FilterBar({
  fields,
  conditions,
  onChange,
  treeMode,
  onTreeModeChange,
}: Props) {
  const { t } = useTranslation();

  const byKey = new Map(fields.map((field) => [field.key, field]));

  const update = (index: number, next: Partial<EditableCondition>) => {
    onChange(
      conditions.map((condition, i) =>
        i === index ? { ...condition, ...next } : condition,
      ),
    );
  };

  const remove = (index: number) => {
    onChange(conditions.filter((_, i) => i !== index));
  };

  const add = () => {
    const first = fields[0];
    if (!first) return;

    onChange([
      ...conditions,
      {
        id: crypto.randomUUID(),
        type: "condition",
        field: first.key,
        operator: defaultOperatorFor(first),
        value: "",
      },
    ]);
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5 px-3 py-2">
      {conditions.map((condition, index) => {
        const field = byKey.get(condition.field);
        const operators = field ? OPERATORS_BY_TYPE[field.valueType] : ["eq"];

        return (
          <div
            key={condition.id}
            className="flex items-center gap-1 rounded-md border border-border/80 bg-background px-1 py-0.5"
          >
            <Select
              value={condition.field}
              onValueChange={(next) => {
                const chosen = next ? byKey.get(next) : undefined;
                if (!chosen) return;
                // Al cambiar de campo, el operador anterior puede no valer
                // para el tipo nuevo: se vuelve al primero que si vale.
                update(index, {
                  field: chosen.key,
                  operator: defaultOperatorFor(chosen),
                  value: "",
                });
              }}
            >
              <SelectTrigger className="h-6 border-none bg-transparent px-1 text-xs shadow-none">
                <SelectValue>{field?.label ?? condition.field}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {fields.map((entry) => (
                  <SelectItem key={entry.key} value={entry.key}>
                    {entry.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={condition.operator}
              onValueChange={(next) =>
                update(index, { operator: (next ?? "eq") as FilterOperator })
              }
            >
              <SelectTrigger className="h-6 border-none bg-transparent px-1 text-xs shadow-none">
                <SelectValue>
                  {t(`tasks:table.operators.${condition.operator}`)}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {operators.map((operator) => (
                  <SelectItem key={operator} value={operator}>
                    {t(`tasks:table.operators.${operator}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {operatorTakesValue(condition.operator) &&
              (field?.options ? (
                <Select
                  value={
                    typeof condition.value === "boolean"
                      ? String(condition.value)
                      : typeof condition.value === "string"
                        ? condition.value
                        : ""
                  }
                  onValueChange={(next) =>
                    update(index, {
                      // Una casilla se compara con un booleano de verdad: el
                      // motor rechaza la cadena "true" con un 400.
                      value:
                        field.valueType === "boolean"
                          ? next === "true"
                          : (next ?? ""),
                    })
                  }
                >
                  <SelectTrigger className="h-6 border-none bg-transparent px-1 text-xs shadow-none">
                    <SelectValue>
                      {field.options.find(
                        (option) => option.value === String(condition.value),
                      )?.label ?? "—"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {field.options.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : field?.valueType === "number" ? (
                <NumberValueInput
                  key={`${condition.id}:${condition.field}`}
                  value={condition.value}
                  onValue={(value) => update(index, { value })}
                  placeholder={t("tasks:table.filterValue")}
                />
              ) : (
                <Input
                  value={
                    condition.value === undefined || condition.value === null
                      ? ""
                      : String(condition.value)
                  }
                  type={field?.valueType === "date" ? "date" : "text"}
                  onChange={(event) =>
                    update(index, { value: event.target.value })
                  }
                  className="h-6 w-28 px-1 text-xs"
                  placeholder={t("tasks:table.filterValue")}
                />
              ))}

            <Button
              variant="ghost"
              size="icon"
              onClick={() => remove(index)}
              aria-label={t("tasks:table.removeFilter")}
              className="h-5 w-5 p-0"
            >
              <X className="size-3" />
            </Button>
          </div>
        );
      })}

      <Button
        variant="ghost"
        size="xs"
        onClick={add}
        className="h-6 gap-1 px-2 text-xs"
      >
        <Plus className="size-3" />
        {t("tasks:table.addFilter")}
      </Button>

      {conditions.length > 0 && (
        <Button
          variant="ghost"
          size="xs"
          onClick={() => onChange([])}
          className="h-6 px-2 text-xs text-muted-foreground"
        >
          {t("common:actions.clearAllFilters")}
        </Button>
      )}

      {/* Que hace el filtro con la jerarquia. Sin esto, filtrar una rama deja
          al padre sin las hijas que no casan, que a veces esconde justo lo que
          se estaba buscando. */}
      {treeMode && onTreeModeChange && (
        <Select
          value={treeMode}
          onValueChange={(next) =>
            onTreeModeChange((next ?? "tree") as TreeMode)
          }
        >
          <SelectTrigger className="ml-auto h-6 border-none bg-transparent px-1 text-muted-foreground text-xs shadow-none">
            <SelectValue>{t(`tasks:table.treeModes.${treeMode}`)}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {TREE_MODES.map((mode) => (
              <SelectItem key={mode} value={mode}>
                {t(`tasks:table.treeModes.${mode}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}

/**
 * El valor de una condicion numerica. Guarda el texto tal como se escribe y solo
 * pasa un numero a la condicion cuando lo es: el motor rechaza la cadena con un
 * 400, pero convertir en cada pulsacion devolvia "1" al teclear "1," y "NaN" al
 * empezar un negativo, asi que no habia forma de escribir ni decimales ni
 * numeros bajo cero.
 */
function NumberValueInput({
  value,
  onValue,
  placeholder,
}: {
  value: unknown;
  onValue: (value: number | "") => void;
  placeholder: string;
}) {
  const { i18n } = useTranslation();
  const [text, setText] = useState(
    value === undefined || value === null ? "" : String(value),
  );
  const invalid =
    text.trim() !== "" && parseLocaleNumber(text, i18n.language) === null;

  return (
    <Input
      value={text}
      inputMode="decimal"
      aria-invalid={invalid}
      onChange={(event) => {
        const raw = event.target.value;
        setText(raw);
        if (raw.trim() === "") {
          onValue("");
          return;
        }
        const parsed = parseLocaleNumber(raw, i18n.language);
        if (parsed !== null) onValue(parsed);
      }}
      className="h-6 w-28 px-1 text-xs"
      placeholder={placeholder}
    />
  );
}

export default FilterBar;
