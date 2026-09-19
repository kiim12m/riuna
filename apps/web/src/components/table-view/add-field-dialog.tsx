import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Los tipos que se pueden crear desde aqui. `relation` queda fuera: su valor
// vive en las relaciones de tarea y necesita un selector propio, no una
// columna de tabla.
const CREATABLE_TYPES = [
  "text",
  "number",
  "currency",
  "select",
  "multi_select",
  "date",
  "checkbox",
  "user",
  "url",
] as const;

// Los tipos que este dialogo sabe crear. Es un subconjunto del vocabulario de
// la API —falta `relation`—, y tenerlo como union y no como `string` es lo que
// hace que el cliente tipado acepte la llamada sin castear.
type CreatableType = (typeof CREATABLE_TYPES)[number];

export type AddFieldPayload = {
  name: string;
  type: CreatableType;
  config?: unknown;
  required?: boolean;
};

type Props = {
  open: boolean;
  pending: boolean;
  onClose: () => void;
  onCreate: (field: AddFieldPayload) => void;
};

function AddFieldDialog({ open, pending, onClose, onCreate }: Props) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [type, setType] = useState<CreatableType>("text");
  const [options, setOptions] = useState("");
  const [currency, setCurrency] = useState("EUR");

  const needsOptions = type === "select" || type === "multi_select";
  const parsedOptions = options
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  // El valor guardado se deriva de la etiqueta y ya no cambia, igual que la
  // `key` del campo: renombrar una opcion no puede huerfanar lo que las tareas
  // tienen guardado. Una etiqueta sin letras ni cifras ("\u20ac") no deja nada que
  // derivar y toma un valor por posicion: la API rechaza un valor vacio.
  const optionEntries = parsedOptions.map((label, index) => ({
    label,
    value: optionValue(label) || `opcion_${index + 1}`,
  }));
  // "Alta" y "alta" dan el mismo valor, y la API rechaza valores repetidos: se
  // dice aqui en vez de esperar al 400.
  const hasDuplicates =
    new Set(optionEntries.map((option) => option.value)).size !==
    optionEntries.length;

  const canSubmit =
    name.trim().length > 0 &&
    (!needsOptions || (parsedOptions.length > 0 && !hasDuplicates)) &&
    (type !== "currency" || /^[A-Z]{3}$/.test(currency));

  // Se limpia al cerrarse, lo cierre quien lo cierre. El padre lo cierra cuando
  // el servidor acepta; limpiar al enviar perdia lo escrito si fallaba.
  useEffect(() => {
    if (!open) {
      setName("");
      setType("text");
      setOptions("");
      setCurrency("EUR");
    }
  }, [open]);

  const submit = () => {
    if (!canSubmit) return;

    const config = needsOptions
      ? { options: optionEntries }
      : type === "currency"
        ? { currency }
        : undefined;

    onCreate({ name: name.trim(), type, config });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("tasks:table.addFieldTitle")}</DialogTitle>
          <DialogDescription>
            {t("tasks:table.addFieldDescription")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="field-name">{t("tasks:table.fieldName")}</Label>
            <Input
              id="field-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t("tasks:table.fieldNamePlaceholder")}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="field-type">{t("tasks:table.fieldType")}</Label>
            <Select
              value={type}
              onValueChange={(next) =>
                setType((next as CreatableType | null) ?? "text")
              }
            >
              <SelectTrigger id="field-type">
                <SelectValue>{t(`tasks:table.fieldTypes.${type}`)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {CREATABLE_TYPES.map((option) => (
                  <SelectItem key={option} value={option}>
                    {t(`tasks:table.fieldTypes.${option}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {needsOptions && (
            <div className="space-y-1.5">
              <Label htmlFor="field-options">
                {t("tasks:table.fieldOptions")}
              </Label>
              <textarea
                id="field-options"
                value={options}
                onChange={(event) => setOptions(event.target.value)}
                rows={4}
                placeholder={t("tasks:table.fieldOptionsPlaceholder")}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-invalid={hasDuplicates}
              />
              {hasDuplicates && (
                <p className="text-destructive text-xs">
                  {t("tasks:table.fieldOptionsDuplicate")}
                </p>
              )}
            </div>
          )}

          {type === "currency" && (
            <div className="space-y-1.5">
              <Label htmlFor="field-currency">
                {t("tasks:table.fieldCurrency")}
              </Label>
              <Input
                id="field-currency"
                value={currency}
                onChange={(event) =>
                  setCurrency(event.target.value.toUpperCase())
                }
                maxLength={3}
                placeholder="EUR"
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            {t("common:actions.cancel")}
          </Button>
          <Button onClick={submit} disabled={!canSubmit || pending}>
            {t("tasks:table.createField")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function optionValue(label: string) {
  return label
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export default AddFieldDialog;
