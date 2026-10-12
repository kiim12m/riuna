import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Priority, Trigger } from "@/fetchers/automation";
import { getPriorityLabel } from "@/lib/i18n/domain";
import { OptionSelect } from "./fields";
import type { EditorScope } from "./model";
import type { AutomationOptions } from "./use-automation-options";

const PRIORITIES: Priority[] = [
  "no-priority",
  "low",
  "medium",
  "high",
  "urgent",
];
const ANY = "any";
const FINAL = "final";

/** Lo que concreta cada disparador: de que columna a cual, a quien, que campo… */
export function TriggerFields({
  trigger,
  scope,
  options,
  onChange,
}: {
  trigger: Trigger;
  scope: EditorScope;
  options: AutomationOptions;
  onChange: (trigger: Trigger) => void;
}) {
  const { t } = useTranslation();
  const any = { id: ANY, name: t("settings:automations.editor.any") };

  switch (trigger.type) {
    case "task.status_changed": {
      const toValue = trigger.toFinal ? FINAL : (trigger.toColumnId ?? ANY);
      const finalOption = {
        id: FINAL,
        name: t("settings:automations.editor.finalColumn"),
      };
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          {scope === "project" && (
            <OptionSelect
              label={t("settings:automations.editor.fromColumn")}
              value={trigger.fromColumnId ?? ANY}
              options={[any, ...options.columns]}
              onChange={(id) =>
                onChange({
                  ...trigger,
                  fromColumnId: id === ANY ? undefined : id,
                })
              }
            />
          )}
          <OptionSelect
            label={t("settings:automations.editor.toColumn")}
            value={toValue}
            options={
              scope === "project"
                ? [any, finalOption, ...options.columns]
                : [any, finalOption]
            }
            onChange={(id) =>
              onChange({
                type: trigger.type,
                fromColumnId: trigger.fromColumnId,
                ...(id === FINAL ? { toFinal: true } : {}),
                ...(id !== FINAL && id !== ANY ? { toColumnId: id } : {}),
              })
            }
          />
        </div>
      );
    }
    case "task.assigned": {
      const value = trigger.userId
        ? `user:${trigger.userId}`
        : trigger.teamId
          ? `team:${trigger.teamId}`
          : ANY;
      return (
        <OptionSelect
          label={t("settings:automations.editor.assignedTo")}
          value={value}
          options={[
            any,
            ...options.members.map((m) => ({
              id: `user:${m.id}`,
              name: m.name,
            })),
            ...options.teams.map((team) => ({
              id: `team:${team.id}`,
              name: t("settings:automations.editor.teamOption", {
                name: team.name,
              }),
            })),
          ]}
          onChange={(id) => {
            const [kind, ref] = id.split(":");
            onChange({
              type: trigger.type,
              ...(kind === "user" ? { userId: ref } : {}),
              ...(kind === "team" ? { teamId: ref } : {}),
            });
          }}
        />
      );
    }
    case "task.priority_changed":
      return (
        <OptionSelect
          label={t("settings:automations.editor.toPriority")}
          value={trigger.to ?? ANY}
          options={[
            any,
            ...PRIORITIES.map((id) => ({ id, name: getPriorityLabel(id) })),
          ]}
          onChange={(id) =>
            onChange({
              type: trigger.type,
              ...(id === ANY ? {} : { to: id as Priority }),
            })
          }
        />
      );
    case "task.field_changed":
      return (
        <OptionSelect
          label={t("settings:automations.editor.field")}
          value={trigger.fieldKey ?? ANY}
          options={[
            any,
            ...options.fields.map((f) => ({ id: f.key, name: f.name })),
          ]}
          onChange={(id) =>
            onChange({
              type: trigger.type,
              ...(id === ANY ? {} : { fieldKey: id }),
            })
          }
        />
      );
    case "task.labeled":
      return (
        <OptionSelect
          label={t("settings:automations.editor.label")}
          value={trigger.labelName ?? ANY}
          options={[
            any,
            ...options.labels.map((label) => ({
              id: label.name,
              name: label.name,
            })),
          ]}
          onChange={(id) =>
            onChange({
              type: trigger.type,
              ...(id === ANY ? {} : { labelName: id }),
            })
          }
        />
      );
    case "task.due_in":
      return (
        <div className="space-y-1.5">
          <Label htmlFor="automation-due-days">
            {t("settings:automations.editor.dueDays")}
          </Label>
          <Input
            id="automation-due-days"
            type="number"
            min={0}
            max={60}
            className="w-28"
            value={trigger.days}
            onChange={(event) =>
              onChange({
                type: trigger.type,
                days: Math.min(
                  60,
                  Math.max(0, Number(event.target.value) || 0),
                ),
              })
            }
          />
          <p className="text-muted-foreground text-xs">
            {t("settings:automations.editor.dueDaysHint")}
          </p>
        </div>
      );
    case "task.overdue":
      return (
        <p className="text-muted-foreground text-xs">
          {t("settings:automations.editor.overdueHint")}
        </p>
      );
    case "manual":
      return (
        <p className="text-muted-foreground text-xs">
          {t("settings:automations.editor.manualHint")}
        </p>
      );
    default:
      return null;
  }
}
