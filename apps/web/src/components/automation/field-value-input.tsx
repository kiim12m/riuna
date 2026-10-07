import { useTranslation } from "react-i18next";
import type { FieldDefinition } from "@/components/table-view/custom-field-cell";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { OptionSelect, PeoplePicker, TextField } from "./fields";
import type { Option } from "./use-automation-options";

function choicesOf(field: FieldDefinition): Option[] {
  const options = Array.isArray(field.config.options)
    ? (field.config.options as Array<{ value: string; label: string }>)
    : [];
  return options.map((option) => ({ id: option.value, name: option.label }));
}

/**
 * El valor que una accion pone en un campo, con el control de su tipo. La API
 * lo valida contra la definicion al guardar la regla, como al editar la tarea.
 */
export function FieldValueInput({
  field,
  members,
  value,
  onChange,
}: {
  field: FieldDefinition;
  members: readonly Option[];
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const { t } = useTranslation();
  const label = t("settings:automations.editor.value");

  switch (field.type) {
    case "number":
    case "currency":
      return (
        <TextField
          label={label}
          type="number"
          value={typeof value === "number" ? value : ""}
          onChange={(event) =>
            onChange(
              event.target.value === "" ? "" : Number(event.target.value),
            )
          }
        />
      );
    case "checkbox":
      return (
        <Label className="flex items-center gap-2 self-end pb-1.5 font-normal">
          <Switch
            checked={value === true}
            onCheckedChange={(checked) => onChange(checked)}
          />
          {field.name}
        </Label>
      );
    case "select":
      return (
        <OptionSelect
          label={label}
          value={typeof value === "string" ? value : ""}
          options={choicesOf(field)}
          onChange={onChange}
        />
      );
    case "multi_select":
      return (
        <PeoplePicker
          label={label}
          value={Array.isArray(value) ? (value as string[]) : []}
          options={choicesOf(field)}
          onChange={onChange}
        />
      );
    case "user":
      return (
        <OptionSelect
          label={label}
          value={typeof value === "string" ? value : ""}
          options={members}
          onChange={onChange}
        />
      );
    case "date":
      return (
        <TextField
          label={label}
          type="date"
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.target.value)}
        />
      );
    default:
      return (
        <TextField
          label={label}
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.target.value)}
        />
      );
  }
}
