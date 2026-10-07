import { X } from "lucide-react";
import { type ComponentProps, useId } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ChatChannel, ChatDestination } from "@/fetchers/automation";
import type { Option } from "./use-automation-options";

/** Un campo de texto con su etiqueta asociada, para lectores de pantalla y pruebas. */
export function TextField({
  label,
  className,
  ...props
}: { label: string; className?: string } & ComponentProps<typeof Input>) {
  const id = useId();
  return (
    <div className={className ?? "space-y-1.5"}>
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} {...props} />
    </div>
  );
}

/** Un desplegable de opciones con su etiqueta; `value` vacio es «ninguna». */
export function OptionSelect({
  label,
  value,
  options,
  onChange,
  placeholder,
}: {
  label?: string;
  value: string;
  options: readonly Option[];
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const current = options.find((option) => option.id === value);
  return (
    <div className="space-y-1.5">
      {label && <Label>{label}</Label>}
      <Select
        value={value}
        onValueChange={(next) => onChange(String(next ?? ""))}
      >
        <SelectTrigger
          aria-label={label ?? placeholder}
          className="h-8 text-sm"
        >
          <SelectValue placeholder={placeholder}>
            {current?.name ?? placeholder}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.id} value={option.id}>
              {option.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/** Varias personas: las elegidas como fichas, y un desplegable para añadir. */
export function PeoplePicker({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: readonly string[];
  options: readonly Option[];
  onChange: (value: string[]) => void;
}) {
  const { t } = useTranslation();
  const chosen = options.filter((option) => value.includes(option.id));
  const remaining = options.filter((option) => !value.includes(option.id));

  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {chosen.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {chosen.map((person) => (
            <li
              key={person.id}
              className="flex items-center gap-1 rounded-md border border-border bg-muted/40 py-0.5 pr-0.5 pl-2 text-xs"
            >
              {person.name}
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={t("settings:automations.editor.removePerson", {
                  name: person.name,
                })}
                onClick={() => onChange(value.filter((id) => id !== person.id))}
              >
                <X className="size-3" />
              </Button>
            </li>
          ))}
        </ul>
      )}
      {remaining.length > 0 && (
        <OptionSelect
          value=""
          options={remaining}
          placeholder={t("settings:automations.editor.addPerson")}
          onChange={(id) => id && onChange([...value, id])}
        />
      )}
    </div>
  );
}

/**
 * Adonde escribe un chat de una regla de espacio. Lo que da acceso al canal
 * —la URL del webhook, el token del bot— no vuelve nunca de la API: el campo
 * dice que ya hay uno guardado, y dejarlo vacio lo conserva.
 */
export function DestinationFields({
  channel,
  destination,
  onChange,
}: {
  channel: ChatChannel;
  destination: ChatDestination;
  onChange: (destination: ChatDestination) => void;
}) {
  const { t } = useTranslation();
  const kept = t("settings:automations.editor.secretKept");
  const set = (patch: Partial<ChatDestination>) =>
    onChange({ ...destination, ...patch });

  if (channel === "telegram") {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField
          className="space-y-1.5 sm:col-span-2"
          label={t("settings:automations.editor.botToken")}
          type="password"
          autoComplete="off"
          value={destination.botToken ?? ""}
          placeholder={destination.hasBotToken ? kept : ""}
          onChange={(event) => set({ botToken: event.target.value })}
        />
        <TextField
          label={t("settings:automations.editor.chatId")}
          value={destination.chatId ?? ""}
          onChange={(event) => set({ chatId: event.target.value })}
        />
        <TextField
          label={t("settings:automations.editor.threadId")}
          inputMode="numeric"
          value={destination.threadId ?? ""}
          onChange={(event) => {
            const value = Number.parseInt(event.target.value, 10);
            set({ threadId: Number.isFinite(value) ? value : undefined });
          }}
        />
      </div>
    );
  }

  return (
    <TextField
      label={t("settings:automations.editor.webhookUrl")}
      type="password"
      autoComplete="off"
      value={destination.webhookUrl ?? ""}
      placeholder={destination.hasWebhookUrl ? kept : ""}
      onChange={(event) => set({ webhookUrl: event.target.value })}
    />
  );
}

export function ChannelSelect({
  value,
  onChange,
}: {
  value: ChatChannel;
  onChange: (channel: ChatChannel) => void;
}) {
  const { t } = useTranslation();
  return (
    <OptionSelect
      label={t("settings:automations.editor.channel")}
      value={value}
      options={(["slack", "discord", "telegram"] as const).map((id) => ({
        id,
        name: t(`settings:automations.channels.${id}`),
      }))}
      onChange={(channel) => onChange(channel as ChatChannel)}
    />
  );
}
