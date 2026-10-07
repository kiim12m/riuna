import { useId } from "react";
import { useTranslation } from "react-i18next";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { Action, Priority } from "@/fetchers/automation";
import { getPriorityLabel } from "@/lib/i18n/domain";
import { FieldValueInput } from "./field-value-input";
import {
  ChannelSelect,
  DestinationFields,
  OptionSelect,
  PeoplePicker,
  TextField,
} from "./fields";
import type { EditorScope } from "./model";
import type { AutomationOptions } from "./use-automation-options";

const PRIORITIES: Priority[] = [
  "no-priority",
  "low",
  "medium",
  "high",
  "urgent",
];
const NONE = "none";

/** Un texto con marcadores, con la ayuda de cuales hay. */
function TemplateInput({
  label,
  value,
  multiline,
  onChange,
}: {
  label: string;
  value: string;
  multiline?: boolean;
  onChange: (value: string) => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const Control = multiline ? Textarea : Input;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Control
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <p className="text-muted-foreground text-xs">
        {t("settings:automations.editor.placeholdersHint")}
      </p>
    </div>
  );
}

/** Lo que concreta cada accion. */
export function ActionFields({
  action,
  scope,
  options,
  onChange,
}: {
  action: Action;
  scope: EditorScope;
  options: AutomationOptions;
  onChange: (action: Action) => void;
}) {
  const { t } = useTranslation();
  const e = (key: string) => t(`settings:automations.editor.${key}`);

  switch (action.type) {
    case "move":
      return (
        <OptionSelect
          label={e("toColumn")}
          value={action.columnId}
          options={options.columns}
          placeholder={e("chooseColumn")}
          onChange={(columnId) => onChange({ ...action, columnId })}
        />
      );
    case "complete":
      return (
        <OptionSelect
          value={action.done ? "done" : "undone"}
          options={[
            { id: "done", name: e("markDone") },
            { id: "undone", name: e("markUndone") },
          ]}
          onChange={(id) => onChange({ ...action, done: id === "done" })}
        />
      );
    case "priority":
      return (
        <OptionSelect
          label={e("priority")}
          value={action.priority}
          options={PRIORITIES.map((id) => ({ id, name: getPriorityLabel(id) }))}
          onChange={(id) => onChange({ ...action, priority: id as Priority })}
        />
      );
    case "due_date":
      return (
        <div className="flex flex-wrap items-end gap-4">
          <TextField
            label={e("dueInDays")}
            type="number"
            min={-365}
            max={365}
            className="space-y-1.5"
            disabled={action.days === null}
            value={action.days ?? ""}
            onChange={(event) =>
              onChange({ ...action, days: Number(event.target.value) || 0 })
            }
          />
          <Label className="flex items-center gap-2 pb-1.5 font-normal">
            <Switch
              checked={action.days === null}
              onCheckedChange={(clear) =>
                onChange({ ...action, days: clear ? null : 1 })
              }
            />
            {e("clearDueDate")}
          </Label>
        </div>
      );
    case "custom_field": {
      const field = options.fields.find((f) => f.key === action.fieldKey);
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          <OptionSelect
            label={e("field")}
            value={action.fieldKey}
            options={options.fields.map((f) => ({ id: f.key, name: f.name }))}
            placeholder={e("chooseField")}
            onChange={(fieldKey) =>
              onChange({ ...action, fieldKey, value: "" })
            }
          />
          {field && (
            <FieldValueInput
              field={field}
              members={options.members}
              value={action.value}
              onChange={(value) => onChange({ ...action, value })}
            />
          )}
        </div>
      );
    }
    case "label":
      return (
        <OptionSelect
          label={e("label")}
          value={action.labelId}
          options={options.labels}
          placeholder={e("chooseLabel")}
          onChange={(labelId) => onChange({ ...action, labelId })}
        />
      );
    case "assign_users":
      return (
        <div className="space-y-3">
          <OptionSelect
            value={action.mode}
            options={(["add", "replace", "remove"] as const).map((id) => ({
              id,
              name: e(`assignMode.${id}`),
            }))}
            onChange={(mode) =>
              onChange({ ...action, mode: mode as typeof action.mode })
            }
          />
          <PeoplePicker
            label={e("people")}
            value={action.userIds}
            options={options.members}
            onChange={(userIds) => onChange({ ...action, userIds })}
          />
        </div>
      );
    case "assign_team":
      return (
        <OptionSelect
          label={e("team")}
          value={action.teamId ?? NONE}
          options={[{ id: NONE, name: e("noTeam") }, ...options.teams]}
          onChange={(id) =>
            onChange({ ...action, teamId: id === NONE ? null : id })
          }
        />
      );
    case "create_task":
      return (
        <div className="space-y-3">
          <TemplateInput
            label={e("taskTitle")}
            value={action.title}
            onChange={(title) => onChange({ ...action, title })}
          />
          <Label className="flex items-center gap-2 font-normal">
            <Switch
              checked={action.asSubtask}
              onCheckedChange={(asSubtask) =>
                onChange({ ...action, asSubtask })
              }
            />
            {e("asSubtask")}
          </Label>
          <PeoplePicker
            label={e("assignees")}
            value={action.assigneeIds ?? []}
            options={options.members}
            onChange={(assigneeIds) => onChange({ ...action, assigneeIds })}
          />
        </div>
      );
    case "notify": {
      const recipients = action.recipients;
      const toggle = (
        key: "assignees" | "creator" | "teamMembers" | "teamLeads",
      ) => (
        <Label key={key} className="flex items-center gap-2 font-normal">
          <Checkbox
            checked={Boolean(recipients[key])}
            onCheckedChange={(checked) =>
              onChange({
                ...action,
                recipients: { ...recipients, [key]: Boolean(checked) },
              })
            }
          />
          {e(`recipients.${key}`)}
        </Label>
      );
      return (
        <div className="space-y-3">
          <fieldset className="grid gap-2 sm:grid-cols-2">
            <legend className="mb-1.5 text-sm font-medium">
              {e("recipientsTitle")}
            </legend>
            {toggle("assignees")}
            {toggle("creator")}
            {toggle("teamMembers")}
            {toggle("teamLeads")}
          </fieldset>
          <PeoplePicker
            label={e("alsoPeople")}
            value={recipients.userIds ?? []}
            options={options.members}
            onChange={(userIds) =>
              onChange({ ...action, recipients: { ...recipients, userIds } })
            }
          />
          <TemplateInput
            label={e("message")}
            multiline
            value={action.message}
            onChange={(message) => onChange({ ...action, message })}
          />
        </div>
      );
    }
    case "webhook":
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField
            className="space-y-1.5 sm:col-span-2"
            label={e("url")}
            type="url"
            value={action.url}
            onChange={(event) =>
              onChange({ ...action, url: event.target.value })
            }
          />
          <TextField
            label={e("signingSecret")}
            type="password"
            autoComplete="off"
            value={action.secret ?? ""}
            placeholder={action.hasSecret ? e("secretKept") : ""}
            onChange={(event) =>
              onChange({ ...action, secret: event.target.value })
            }
          />
        </div>
      );
    case "chat":
      return (
        <div className="space-y-3">
          <ChannelSelect
            value={action.channel}
            onChange={(channel) => onChange({ ...action, channel })}
          />
          {scope === "workspace" ? (
            <DestinationFields
              channel={action.channel}
              destination={action.destination ?? {}}
              onChange={(destination) => onChange({ ...action, destination })}
            />
          ) : (
            <p className="text-muted-foreground text-xs">
              {e("projectChatHint")}
            </p>
          )}
          <TemplateInput
            label={e("message")}
            multiline
            value={action.message}
            onChange={(message) => onChange({ ...action, message })}
          />
        </div>
      );
    case "standup":
      return (
        <div className="space-y-3">
          <ChannelSelect
            value={action.channel}
            onChange={(channel) => onChange({ ...action, channel })}
          />
          <DestinationFields
            channel={action.channel}
            destination={action.destination}
            onChange={(destination) => onChange({ ...action, destination })}
          />
        </div>
      );
  }
}
