import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { parseLocaleNumber } from "@/lib/parse-locale-number";

export type FieldDefinition = {
  id: string;
  key: string;
  name: string;
  type: string;
  required: boolean;
  config: Record<string, unknown>;
  /** El texto de ayuda (ADR 090). */
  description?: string | null;
};

export type FieldMember = {
  id: string;
  name: string;
  image: string | null;
};

type Props = {
  definition: FieldDefinition;
  value: unknown;
  onCommit: (value: unknown) => void;
  disabled?: boolean;
  // Los miembros del espacio, para los campos de tipo `usuario`. Sin ellos la
  // celda solo podria mostrar el identificador en crudo.
  members?: FieldMember[];
};

function optionsOf(definition: FieldDefinition) {
  const options = definition.config?.options;
  if (!Array.isArray(options)) return [];
  return options.filter(
    (option): option is { value: string; label: string } =>
      Boolean(option) &&
      typeof option === "object" &&
      typeof (option as { value?: unknown }).value === "string",
  );
}

export function formatForDisplay(definition: FieldDefinition, value: unknown) {
  if (value === null || value === undefined || value === "") return "";

  // Un calculado lleva su formato en la configuracion (ADR 090).
  if (definition.type === "formula" && typeof value === "number") {
    const format = definition.config?.format;
    if (format === "currency") {
      return formatForDisplay(
        { ...definition, type: "currency", config: definition.config },
        value,
      );
    }
    return new Intl.NumberFormat(undefined, {
      style: format === "percent" ? "percent" : "decimal",
      maximumFractionDigits: format === "percent" ? 1 : 2,
    }).format(value);
  }

  if (definition.type === "currency" && typeof value === "number") {
    const currency =
      typeof definition.config?.currency === "string"
        ? definition.config.currency
        : "EUR";
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
    }).format(value);
  }

  if (definition.type === "multi_select" && Array.isArray(value)) {
    const labels = new Map(
      optionsOf(definition).map((option) => [option.value, option.label]),
    );
    return value.map((entry) => labels.get(String(entry)) ?? entry).join(", ");
  }

  // Seleccion multiple: un menu de casillas, que es el patron que ya usan los
  // filtros del backlog. El editor de texto no vale aqui —mandaria una cadena
  // y la API espera una lista—, que es lo que hacia antes.
  if (definition.type === "select") {
    const match = optionsOf(definition).find(
      (option) => option.value === value,
    );
    return match?.label ?? String(value);
  }

  return String(value);
}

/**
 * Una celda de campo personalizado. Muestra el valor formateado y, al pulsar,
 * pasa al editor que corresponde a su tipo.
 *
 * El valor se manda al confirmar —Enter o al perder el foco— y no en cada
 * pulsacion: una tabla que escribiera por tecla haria una peticion por letra.
 */
function CustomFieldCell({
  definition,
  value,
  onCommit,
  disabled,
  members = [],
}: Props) {
  const { i18n } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [invalid, setInvalid] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  // Lo escribe la base a partir de su formula: se lee, no se edita.
  if (definition.type === "formula") {
    const display = formatForDisplay(definition, value);
    return (
      <span
        className="block w-full truncate px-1 py-0.5 text-xs tabular-nums"
        data-testid="formula-value"
      >
        {display || <span className="text-muted-foreground">—</span>}
      </span>
    );
  }

  if (definition.type === "multi_select") {
    const options = optionsOf(definition);
    const selected = Array.isArray(value) ? value.map(String) : [];

    const toggle = (option: string) => {
      const next = selected.includes(option)
        ? selected.filter((entry) => entry !== option)
        : [...selected, option];
      onCommit(next.length > 0 ? next : null);
    };

    return (
      <DropdownMenu>
        <DropdownMenuTrigger
          disabled={disabled}
          render={
            <button
              type="button"
              className="w-full truncate rounded px-1 py-0.5 text-left text-xs hover:bg-accent/50 disabled:cursor-not-allowed"
            />
          }
        >
          {formatForDisplay(definition, value) || (
            <span className="text-muted-foreground">—</span>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {options.map((option) => (
            <DropdownMenuCheckboxItem
              key={option.value}
              checked={selected.includes(option.value)}
              onCheckedChange={() => toggle(option.value)}
              className="h-8 text-sm"
            >
              {option.label}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  // Persona: se elige de la lista del espacio de trabajo. Antes se mostraba el
  // identificador en crudo y habia que teclearlo a mano, que no es una
  // interfaz.
  if (definition.type === "user") {
    const current = typeof value === "string" ? value : null;
    const member = members.find((entry) => entry.id === current);

    return (
      <DropdownMenu>
        <DropdownMenuTrigger
          disabled={disabled}
          render={
            <button
              type="button"
              className="w-full truncate rounded px-1 py-0.5 text-left text-xs hover:bg-accent/50 disabled:cursor-not-allowed"
            />
          }
        >
          {member ? (
            <span className="flex items-center gap-1.5">
              <Avatar className="size-4">
                <AvatarImage src={member.image ?? ""} alt="" />
                <AvatarFallback className="text-label">
                  {member.name.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span className="truncate">{member.name}</span>
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem
            onClick={() => onCommit(null)}
            className="h-8 text-sm"
          >
            <span className="text-muted-foreground">—</span>
          </DropdownMenuItem>
          {members.map((entry) => (
            <DropdownMenuItem
              key={entry.id}
              onClick={() => onCommit(entry.id)}
              className="h-8 text-sm"
            >
              <Avatar className="size-5">
                <AvatarImage src={entry.image ?? ""} alt="" />
                <AvatarFallback className="text-label">
                  {entry.name.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span className="truncate">{entry.name}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  // El checkbox y los desplegables no tienen modo de edicion: se cambian de un
  // gesto, asi que se pintan siempre activos.
  if (definition.type === "checkbox") {
    return (
      <Checkbox
        checked={value === true}
        disabled={disabled}
        onCheckedChange={(checked) => onCommit(checked === true)}
        aria-label={definition.name}
      />
    );
  }

  if (definition.type === "select") {
    const options = optionsOf(definition);
    const current = typeof value === "string" ? value : "";
    const currentLabel = options.find(
      (option) => option.value === current,
    )?.label;

    return (
      <Select
        value={current}
        disabled={disabled}
        onValueChange={(next) => onCommit(next === "" ? null : next)}
      >
        <SelectTrigger className="h-7 border-none bg-transparent px-1 text-xs shadow-none hover:bg-accent/50">
          <SelectValue>
            {currentLabel ?? <span className="text-muted-foreground">—</span>}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  const stopEditing = () => {
    setEditing(false);
    setInvalid(false);
  };

  const commit = ({ fromBlur }: { fromBlur: boolean }) => {
    const trimmed = draft.trim();

    if (trimmed === "") {
      stopEditing();
      onCommit(null);
      return;
    }

    if (definition.type === "number" || definition.type === "currency") {
      // Se lee en la configuracion de quien escribe —en español, "1.500,50" es
      // mil quinientos— y se manda el numero: el validador de la API rechaza el
      // texto. Lo que no es un numero **no se manda**: enviar null borraba el
      // valor que ya habia. Con Intro la celda sigue abierta y marcada; al
      // salir de ella se descarta la edicion.
      const parsed = parseLocaleNumber(trimmed, i18n.language);
      if (parsed === null) {
        if (fromBlur) stopEditing();
        else setInvalid(true);
        return;
      }
      stopEditing();
      onCommit(parsed);
      return;
    }

    stopEditing();
    onCommit(trimmed);
  };

  if (!editing) {
    const display = formatForDisplay(definition, value);

    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          setDraft(value === null || value === undefined ? "" : String(value));
          setEditing(true);
        }}
        className="w-full truncate rounded px-1 py-0.5 text-left text-xs hover:bg-accent/50 disabled:cursor-not-allowed"
        title={display}
      >
        {display || <span className="text-muted-foreground">—</span>}
      </button>
    );
  }

  return (
    <Input
      ref={inputRef}
      value={draft}
      inputMode={
        definition.type === "number" || definition.type === "currency"
          ? "decimal"
          : undefined
      }
      type={definition.type === "date" ? "date" : "text"}
      placeholder={definition.type === "url" ? "https://…" : undefined}
      aria-invalid={invalid}
      onChange={(event) => {
        setDraft(event.target.value);
        setInvalid(false);
      }}
      onBlur={() => commit({ fromBlur: true })}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          commit({ fromBlur: false });
        }
        if (event.key === "Escape") {
          event.preventDefault();
          stopEditing();
        }
      }}
      className="h-7 px-1 text-xs"
    />
  );
}

export default CustomFieldCell;
