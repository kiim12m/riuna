import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
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
import { formulaToEditable } from "@/lib/formula-text";

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
  "formula",
] as const;

// Los tipos que este dialogo sabe crear. Es un subconjunto del vocabulario de
// la API —falta `relation`—, y tenerlo como union y no como `string` es lo que
// hace que el cliente tipado acepte la llamada sin castear.
type CreatableType = (typeof CREATABLE_TYPES)[number];

const FORMULA_FORMATS = ["number", "currency", "percent"] as const;
type FormulaFormat = (typeof FORMULA_FORMATS)[number];

/** Los tipos que una formula puede leer (ADR 090). */
const FORMULA_INPUTS = new Set(["number", "currency", "formula"]);

export type AddFieldPayload = {
  name: string;
  type: CreatableType;
  config?: unknown;
  required?: boolean;
  description?: string | null;
};

export type FieldPatch = {
  name: string;
  description: string | null;
  config?: unknown;
};

export type EditableField = {
  id: string;
  key: string;
  name: string;
  type: string;
  description?: string | null;
  config?: Record<string, unknown>;
};

type Props = {
  open: boolean;
  pending: boolean;
  onClose: () => void;
  onCreate?: (field: AddFieldPayload) => void;
  /** Con un campo, el dialogo lo edita: su tipo y su clave no cambian. */
  editing?: EditableField | null;
  onUpdate?: (patch: FieldPatch) => void;
  /**
   * Los campos que una formula puede leer. Sin ellos no se ofrece el tipo
   * calculado: un campo de proyecto (ADR 088) no lo admite.
   */
  formulaFields?: Array<{ key: string; name: string; type: string }>;
};

function AddFieldDialog({
  open,
  pending,
  onClose,
  onCreate,
  editing = null,
  onUpdate,
  formulaFields,
}: Props) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [type, setType] = useState<CreatableType>("text");
  const [options, setOptions] = useState("");
  const [currency, setCurrency] = useState("EUR");
  const [help, setHelp] = useState("");
  const [expression, setExpression] = useState("");
  const [format, setFormat] = useState<FormulaFormat>("number");
  const expressionRef = useRef<HTMLTextAreaElement>(null);

  const builtins = {
    estimate: t("tasks:fields.formula.estimate"),
    logged: t("tasks:fields.formula.logged"),
  };
  const types = formulaFields
    ? CREATABLE_TYPES
    : CREATABLE_TYPES.filter((option) => option !== "formula");

  const needsOptions =
    !editing && (type === "select" || type === "multi_select");
  const isFormula = type === "formula";
  const parsedOptions = options
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  // El valor guardado se deriva de la etiqueta y ya no cambia, igual que la
  // `key` del campo: renombrar una opcion no puede huerfanar lo que las tareas
  // tienen guardado. Una etiqueta sin letras ni cifras ("€") no deja nada que
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

  const needsCurrency =
    (!editing && type === "currency") || (isFormula && format === "currency");

  const canSubmit =
    name.trim().length > 0 &&
    (!needsOptions || (parsedOptions.length > 0 && !hasDuplicates)) &&
    (!needsCurrency || /^[A-Z]{3}$/.test(currency)) &&
    (!isFormula || expression.trim().length > 0);

  // Se limpia al cerrarse, lo cierre quien lo cierre, y se rellena al abrirse
  // para editar. El padre lo cierra cuando el servidor acepta; limpiar al
  // enviar perdia lo escrito si fallaba.
  // biome-ignore lint/correctness/useExhaustiveDependencies: se rellena al abrir, no en cada render de quien lo usa.
  useEffect(() => {
    if (!open) {
      setName("");
      setType("text");
      setOptions("");
      setCurrency("EUR");
      setHelp("");
      setExpression("");
      setFormat("number");
      return;
    }
    if (editing) {
      const config = editing.config ?? {};
      setName(editing.name);
      setType(editing.type as CreatableType);
      setHelp(editing.description ?? "");
      if (editing.type === "formula") {
        setExpression(
          formulaToEditable(
            String(config.expression ?? ""),
            formulaFields ?? [],
            builtins,
          ),
        );
        setFormat(
          FORMULA_FORMATS.includes(config.format as FormulaFormat)
            ? (config.format as FormulaFormat)
            : "number",
        );
        if (typeof config.currency === "string") setCurrency(config.currency);
      }
    }
  }, [open, editing?.id]);

  const formulaConfig = () => ({
    expression: expression.trim(),
    format,
    ...(format === "currency" ? { currency } : {}),
  });

  const submit = () => {
    if (!canSubmit) return;
    const description = help.trim() || null;

    if (editing) {
      onUpdate?.({
        name: name.trim(),
        description,
        ...(isFormula ? { config: formulaConfig() } : {}),
      });
      return;
    }

    const config = needsOptions
      ? { options: optionEntries }
      : type === "currency"
        ? { currency }
        : isFormula
          ? formulaConfig()
          : undefined;

    onCreate?.({ name: name.trim(), type, config, description });
  };

  // Mete `{Nombre}` donde esta el cursor, como quien pulsa una tecla.
  const insert = (text: string) => {
    const input = expressionRef.current;
    const start = input?.selectionStart ?? expression.length;
    const end = input?.selectionEnd ?? expression.length;
    const next = `${expression.slice(0, start)}${text}${expression.slice(end)}`;
    setExpression(next);
    requestAnimationFrame(() => {
      input?.focus();
      input?.setSelectionRange(start + text.length, start + text.length);
    });
  };

  const readable = (formulaFields ?? []).filter(
    (field) => FORMULA_INPUTS.has(field.type) && field.key !== editing?.key,
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {editing
              ? t("tasks:table.editFieldTitle")
              : t("tasks:table.addFieldTitle")}
          </DialogTitle>
          <DialogDescription>
            {editing
              ? t("tasks:table.editFieldDescription")
              : t("tasks:table.addFieldDescription")}
          </DialogDescription>
        </DialogHeader>

        {/* El panel pone el margen y se desplaza: con la formula, el dialogo
            no cabe en una pantalla baja y el boton de crear quedaba fuera. */}
        <DialogPanel className="space-y-4">
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
              disabled={Boolean(editing)}
              onValueChange={(next) =>
                setType((next as CreatableType | null) ?? "text")
              }
            >
              <SelectTrigger id="field-type">
                <SelectValue>{t(`tasks:table.fieldTypes.${type}`)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {types.map((option) => (
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

          {isFormula && (
            <div className="space-y-1.5">
              <Label htmlFor="field-formula">
                {t("tasks:fields.formula.label")}
              </Label>
              <textarea
                id="field-formula"
                ref={expressionRef}
                value={expression}
                onChange={(event) => setExpression(event.target.value)}
                rows={3}
                maxLength={500}
                spellCheck={false}
                placeholder={t("tasks:fields.formula.placeholder")}
                className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <div className="flex flex-wrap items-center gap-1">
                <span className="text-muted-foreground text-xs">
                  {t("tasks:fields.formula.insert")}
                </span>
                {[
                  ...readable.map((field) => field.name),
                  builtins.estimate,
                  builtins.logged,
                ].map((label) => (
                  <Button
                    key={label}
                    type="button"
                    variant="outline"
                    size="xs"
                    onClick={() => insert(`{${label}}`)}
                  >
                    {label}
                  </Button>
                ))}
              </div>
              <p className="text-muted-foreground text-xs">
                {t("tasks:fields.formula.hint")}
              </p>
            </div>
          )}

          {isFormula && (
            <div className="space-y-1.5">
              <Label htmlFor="field-format">
                {t("tasks:fields.formula.format")}
              </Label>
              <Select
                value={format}
                onValueChange={(next) =>
                  setFormat((next as FormulaFormat | null) ?? "number")
                }
              >
                <SelectTrigger id="field-format">
                  <SelectValue>
                    {t(`tasks:fields.formula.formats.${format}`)}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {FORMULA_FORMATS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {t(`tasks:fields.formula.formats.${option}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {needsCurrency && (
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

          <div className="space-y-1.5">
            <Label htmlFor="field-help">{t("tasks:fields.helpText")}</Label>
            <textarea
              id="field-help"
              value={help}
              onChange={(event) => setHelp(event.target.value)}
              rows={2}
              maxLength={500}
              placeholder={t("tasks:fields.helpTextPlaceholder")}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
        </DialogPanel>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            {t("common:actions.cancel")}
          </Button>
          <Button onClick={submit} disabled={!canSubmit || pending}>
            {editing
              ? t("tasks:table.saveField")
              : t("tasks:table.createField")}
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
