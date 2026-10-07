import { Pencil, Send } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/components/providers/auth-provider/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { Action, Automation } from "@/fetchers/automation";
import {
  useGetAutomations,
  useSaveAutomation,
  useSetAutomationEnabled,
} from "@/hooks/queries/automation/use-automations";
import { useTeamLeads } from "@/hooks/queries/lead/use-leads";
import useGetTeams from "@/hooks/queries/team/use-get-teams";
import { toast } from "@/lib/toast";
import { WEEKDAYS_MONDAY_FIRST, weekdayLabel } from "@/lib/weekdays";
import { ChannelSelect, DestinationFields } from "./fields";
import { newId, toInput } from "./model";

type Standup = Extract<Action, { type: "standup" }>;
type Schedule = { weekdays: number[]; time: string };

/**
 * Programar el envio del stand-up de un departamento a un chat (ADR 068).
 * Lo usa el responsable desde «Mi equipo» y el admin desde las reglas del
 * espacio. Enviarlo amplia quien lo lee: lo decide quien lo programa.
 */
export function StandupScheduleEditor({
  workspaceId,
  teamId,
  teamName,
  automation,
  onClose,
}: {
  workspaceId: string;
  teamId: string;
  teamName: string;
  automation: Automation | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const s = (key: string, options?: Record<string, unknown>) =>
    t(`settings:automations.standup.${key}`, options);
  const saved =
    automation?.trigger.type === "schedule" ? automation.trigger : null;
  const savedAction = automation?.actions.find(
    (action): action is Standup => action.type === "standup",
  );
  const [schedule, setSchedule] = useState<Schedule>({
    weekdays: saved?.weekdays ?? [1, 2, 3, 4, 5],
    time: saved?.time ?? "09:30",
  });
  const [action, setAction] = useState<Standup>(
    savedAction ?? {
      id: newId(),
      type: "standup",
      channel: "slack",
      destination: {},
    },
  );
  const save = useSaveAutomation({ kind: "workspace", workspaceId });

  const toggleDay = (day: number, on: boolean) =>
    setSchedule((current) => ({
      ...current,
      weekdays: on
        ? [...current.weekdays, day]
        : current.weekdays.filter((item) => item !== day),
    }));

  const submit = async () => {
    try {
      await save.mutateAsync({
        id: automation?.id,
        input: toInput({
          name: s("ruleName", { team: teamName }),
          teamId,
          trigger: { type: "schedule", ...schedule },
          conditions: [],
          actions: [action],
        }),
      });
      toast.success(s("saved"));
      onClose();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("settings:automations.editor.saveError"),
      );
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{s("title", { team: teamName })}</DialogTitle>
        </DialogHeader>
        <DialogPanel className="space-y-4">
          <p className="text-muted-foreground text-sm">
            {s("audienceWarning")}
          </p>
          <fieldset className="space-y-2">
            <legend className="mb-1.5 text-sm font-medium">{s("days")}</legend>
            <div className="flex flex-wrap gap-3">
              {WEEKDAYS_MONDAY_FIRST.map((day) => (
                <Label
                  key={day}
                  className="flex items-center gap-1.5 font-normal"
                >
                  <Checkbox
                    checked={schedule.weekdays.includes(day)}
                    onCheckedChange={(checked) =>
                      toggleDay(day, Boolean(checked))
                    }
                  />
                  {weekdayLabel(day)}
                </Label>
              ))}
            </div>
          </fieldset>
          <div className="space-y-1.5">
            <Label htmlFor="standup-time">{s("time")}</Label>
            <Input
              id="standup-time"
              type="time"
              className="w-32"
              value={schedule.time}
              onChange={(event) =>
                setSchedule((current) => ({
                  ...current,
                  time: event.target.value,
                }))
              }
            />
          </div>
          <ChannelSelect
            value={action.channel}
            onChange={(channel) =>
              setAction((current) => ({ ...current, channel }))
            }
          />
          <DestinationFields
            channel={action.channel}
            destination={action.destination}
            onChange={(destination) =>
              setAction((current) => ({ ...current, destination }))
            }
          />
          <p className="text-muted-foreground text-xs">{s("rules")}</p>
        </DialogPanel>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" size="sm" />}>
            {t("settings:automations.editor.cancel")}
          </DialogClose>
          <Button
            size="sm"
            disabled={save.isPending || schedule.weekdays.length === 0}
            onClick={submit}
          >
            {t("settings:automations.editor.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TeamDeliveries({
  workspaceId,
  teamId,
  teamName,
}: {
  workspaceId: string;
  teamId: string;
  teamName: string;
}) {
  const { t } = useTranslation();
  const s = (key: string, options?: Record<string, unknown>) =>
    t(`settings:automations.standup.${key}`, options);
  const { data: rules = [] } = useGetAutomations({
    kind: "team",
    workspaceId,
    teamId,
  });
  const setEnabled = useSetAutomationEnabled();
  const [editing, setEditing] = useState<Automation | "new" | null>(null);

  return (
    <div className="space-y-2" data-testid={`standup-schedule-${teamId}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">{teamName}</p>
        {rules.length === 0 && (
          <Button size="sm" variant="outline" onClick={() => setEditing("new")}>
            <Send />
            {s("schedule")}
          </Button>
        )}
      </div>
      {rules.map((rule) => (
        <div key={rule.id} className="flex items-center gap-3 text-sm">
          <Switch
            aria-label={t("settings:automations.toggle", { name: rule.name })}
            checked={rule.enabled}
            onCheckedChange={(enabled) =>
              setEnabled.mutate({ id: rule.id, enabled })
            }
          />
          <span className="flex-1 text-muted-foreground">
            {rule.trigger.type === "schedule"
              ? s("summary", {
                  days: rule.trigger.weekdays.map(weekdayLabel).join(", "),
                  time: rule.trigger.time,
                })
              : rule.name}
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("settings:automations.edit", { name: rule.name })}
            onClick={() => setEditing(rule)}
          >
            <Pencil />
          </Button>
        </div>
      ))}
      {editing && (
        <StandupScheduleEditor
          workspaceId={workspaceId}
          teamId={teamId}
          teamName={teamName}
          automation={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

/** En «Mi equipo»: los envios del stand-up de los departamentos que llevo. */
export function StandupDeliveries({ workspaceId }: { workspaceId: string }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { data: leads = [] } = useTeamLeads(workspaceId);
  const { data: teams = [] } = useGetTeams({ workspaceId });
  const mine = (teams as Array<{ id: string; name: string }>).filter((team) =>
    (leads as Array<{ teamId: string; userId: string }>).some(
      (lead) => lead.teamId === team.id && lead.userId === user?.id,
    ),
  );

  if (mine.length === 0) return null;

  return (
    <section className="space-y-3 rounded-lg border border-border p-3">
      <div className="space-y-0.5">
        <h2 className="text-sm font-medium">
          {t("settings:automations.standup.sectionTitle")}
        </h2>
        <p className="text-muted-foreground text-xs">
          {t("settings:automations.standup.sectionHint")}
        </p>
      </div>
      {mine.map((team) => (
        <TeamDeliveries
          key={team.id}
          workspaceId={workspaceId}
          teamId={team.id}
          teamName={team.name}
        />
      ))}
    </section>
  );
}
