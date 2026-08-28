import { Plus, X } from "lucide-react";
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
import {
  type EditableCondition,
  type FilterableField,
  type FilterOperator,
  OPERATORS_BY_TYPE,
  operatorTakesValue,
} from "@/types/task-filter";

type Props = {
  fields: FilterableField[];
  conditions: EditableCondition[];
  onChange: (conditions: EditableCondition[]) => void;
};

function defaultOperatorFor(field: FilterableField): FilterOperator {
  return OPERATORS_BY_TYPE[field.valueType][0] ?? "eq";
}

/**
 * Las condiciones se combinan con Y. El motor entiende tambien O y negacion;
 * ofrecerlos aqui es interfaz que todavia no hace falta, y una barra que pida
 * elegir el conector antes de escribir la primera condicion se usa peor.
 */
function FilterBar({ fields, conditions, onChange }: Props) {
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
                    typeof condition.value === "string" ? condition.value : ""
                  }
                  onValueChange={(next) => update(index, { value: next ?? "" })}
                >
                  <SelectTrigger className="h-6 border-none bg-transparent px-1 text-xs shadow-none">
                    <SelectValue>
                      {field.options.find(
                        (option) => option.value === condition.value,
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
              ) : (
                <Input
                  value={
                    condition.value === undefined || condition.value === null
                      ? ""
                      : String(condition.value)
                  }
                  type={field?.valueType === "date" ? "date" : "text"}
                  inputMode={
                    field?.valueType === "number" ? "decimal" : undefined
                  }
                  onChange={(event) => {
                    const raw = event.target.value;
                    // Los campos numericos mandan numero, no texto: el motor
                    // rechaza la cadena con un 400 y hace bien.
                    update(index, {
                      value:
                        field?.valueType === "number" && raw !== ""
                          ? Number(raw.replace(",", "."))
                          : raw,
                    });
                  }}
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
    </div>
  );
}

export default FilterBar;
