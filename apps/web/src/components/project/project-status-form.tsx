import { useEffect, useId, useMemo, useState } from "react";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useUpdateProjectStatus } from "@/hooks/mutations/project/use-update-project-status";
import useGetProject from "@/hooks/queries/project/use-get-project";
import { useGetProjectActivity } from "@/hooks/queries/project/use-get-project-activity";
import { useGetActiveWorkspaceUsers } from "@/hooks/queries/workspace-users/use-get-active-workspace-users";
import { cn } from "@/lib/cn";
import { dayKey, parseDayKey } from "@/lib/day-key";
import { formatDate, formatDateMedium } from "@/lib/format";
import {
  isProjectHealth,
  PROJECT_HEALTHS,
  type ProjectHealth,
} from "@/lib/project-health";
import { toast } from "@/lib/toast";
import { HealthDot, ProjectScheduleWarning } from "./project-health";

const NO_LEAD = "__none";

const toKey = (value: string | Date | null | undefined) =>
  value ? dayKey(new Date(value)) : "";
const fromKey = (key: string) => (key ? parseDayKey(key).toISOString() : null);

/**
 * El estado de un proyecto entero (ADR 087), en sus ajustes: la salud con su
 * nota, las fechas, el responsable y la historia de todo ello.
 */
export default function ProjectStatusForm({
  projectId,
  workspaceId,
  canEdit,
}: {
  projectId: string;
  workspaceId: string;
  canEdit: boolean;
}) {
  const { t } = useTranslation();
  const { data: project } = useGetProject({ id: projectId, workspaceId });
  const { data: workspaceUsers } = useGetActiveWorkspaceUsers(workspaceId);
  const { mutate, isPending } = useUpdateProjectStatus(workspaceId);

  const saved = useMemo(
    () => ({
      health: (isProjectHealth(project?.health)
        ? project?.health
        : "not_started") as ProjectHealth,
      note: project?.healthNote ?? "",
      start: toKey(project?.startDate),
      end: toKey(project?.endDate),
      lead: project?.leadUserId ?? NO_LEAD,
    }),
    [project],
  );
  const [draft, setDraft] = useState(saved);
  const [notify, setNotify] = useState(false);
  const id = useId();
  useEffect(() => setDraft(saved), [saved]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const invalidDates = Boolean(
    draft.start && draft.end && draft.end < draft.start,
  );
  const members = workspaceUsers?.members ?? [];

  const save = () => {
    mutate(
      {
        projectId,
        input: {
          health: draft.health,
          note: draft.note.trim() || null,
          startDate: fromKey(draft.start),
          endDate: fromKey(draft.end),
          leadUserId: draft.lead === NO_LEAD ? null : draft.lead,
          notify,
        },
      },
      {
        onSuccess: () => {
          setNotify(false);
          toast.success(t("workspace:projects.health.saved"));
        },
        onError: (error) =>
          toast.error(
            error instanceof Error
              ? error.message
              : t("workspace:projects.health.error"),
          ),
      },
    );
  };

  if (!project) return null;

  return (
    <div className="space-y-8">
      <div className="space-y-5" data-testid="project-status-form">
        <div className="space-y-2">
          <p className="font-medium text-sm">
            {t("settings:projectStatus.health")}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {PROJECT_HEALTHS.map((health) => (
              <button
                key={health}
                type="button"
                aria-pressed={draft.health === health}
                disabled={!canEdit}
                onClick={() => setDraft({ ...draft, health })}
                className={cn(
                  "inline-flex h-7 items-center gap-1.5 rounded-full border border-border/80 px-2.5 text-xs hover:bg-accent disabled:opacity-60",
                  draft.health === health && "border-foreground/40 bg-accent",
                )}
              >
                <HealthDot health={health} />
                {t(`workspace:projects.health.${health}`)}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor={`${id}-note`} className="block font-medium text-sm">
            {t("workspace:projects.health.note")}
          </label>
          <Textarea
            id={`${id}-note`}
            value={draft.note}
            maxLength={500}
            rows={2}
            disabled={!canEdit}
            placeholder={t("workspace:projects.health.notePlaceholder")}
            onChange={(event) =>
              setDraft({ ...draft, note: event.target.value })
            }
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <label
              htmlFor={`${id}-start`}
              className="block font-medium text-sm"
            >
              {t("workspace:projects.startDate")}
            </label>
            <Input
              id={`${id}-start`}
              type="date"
              value={draft.start}
              disabled={!canEdit}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                setDraft({ ...draft, start: event.target.value })
              }
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor={`${id}-end`} className="block font-medium text-sm">
              {t("workspace:projects.endDate")}
            </label>
            <Input
              id={`${id}-end`}
              type="date"
              value={draft.end}
              disabled={!canEdit}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                setDraft({ ...draft, end: event.target.value })
              }
            />
          </div>
          <div className="space-y-1.5">
            <span className="block font-medium text-sm">
              {t("workspace:projects.lead")}
            </span>
            <Select
              value={draft.lead}
              disabled={!canEdit}
              onValueChange={(lead) =>
                setDraft({ ...draft, lead: String(lead) })
              }
            >
              <SelectTrigger aria-label={t("workspace:projects.lead")}>
                <SelectValue>
                  {draft.lead === NO_LEAD
                    ? t("settings:projectStatus.noLead")
                    : (members.find((member) => member.userId === draft.lead)
                        ?.user?.name ?? "")}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_LEAD}>
                  {t("settings:projectStatus.noLead")}
                </SelectItem>
                {members.map((member) => (
                  <SelectItem key={member.userId} value={member.userId}>
                    {member.user?.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {project.schedule && (
          <p className="flex items-center gap-2 text-destructive-foreground text-sm">
            <ProjectScheduleWarning schedule={project.schedule} />
            {t("workspace:projects.overflow", {
              date: formatDate(project.schedule.tasksDueDate, {
                day: "numeric",
                month: "short",
              }),
              count: project.schedule.overflowWorkDays,
            })}
          </p>
        )}
        {invalidDates && (
          <p className="text-destructive-foreground text-sm">
            {t("settings:projectStatus.invalidDates")}
          </p>
        )}

        {canEdit && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm">
              <Switch
                id={`${id}-notify`}
                checked={notify}
                disabled={draft.health === saved.health}
                onCheckedChange={setNotify}
              />
              <label htmlFor={`${id}-notify`}>
                {t("workspace:projects.health.notify")}
              </label>
            </div>
            <Button
              size="sm"
              disabled={!dirty || invalidDates || isPending}
              onClick={save}
            >
              {t("workspace:projects.health.save")}
            </Button>
          </div>
        )}
      </div>

      <ProjectStatusHistory
        projectId={projectId}
        memberName={(userId) =>
          members.find((member) => member.userId === userId)?.user?.name ?? null
        }
      />
    </div>
  );
}

function ProjectStatusHistory({
  projectId,
  memberName,
}: {
  projectId: string;
  memberName: (userId: string) => string | null;
}) {
  const { t } = useTranslation();
  const { data: entries = [] } = useGetProjectActivity(projectId);

  const describe = (entry: (typeof entries)[number]) => {
    const data = entry.eventData as Record<string, unknown>;
    if (entry.type === "health_changed") {
      const to = isProjectHealth(data.to) ? data.to : "not_started";
      return t("settings:projectStatus.history.health", {
        health: t(`workspace:projects.health.${to}`),
      });
    }
    if (entry.type === "dates_changed") {
      const next = (data.to ?? {}) as { start?: string; end?: string };
      return t("settings:projectStatus.history.dates", {
        start: next.start ? formatDateMedium(next.start) : "—",
        end: next.end ? formatDateMedium(next.end) : "—",
      });
    }
    if (entry.type === "lead_changed") {
      const name = typeof data.to === "string" ? memberName(data.to) : null;
      return data.to
        ? t("settings:projectStatus.history.lead", { name: name ?? "?" })
        : t("settings:projectStatus.history.leadRemoved");
    }
    return entry.type;
  };

  return (
    <div className="space-y-2">
      <h2 className="font-medium text-md">
        {t("settings:projectStatus.history.title")}
      </h2>
      {entries.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {t("settings:projectStatus.history.empty")}
        </p>
      ) : (
        <ul className="space-y-2" data-testid="project-status-history">
          {entries.map((entry) => {
            const data = entry.eventData as Record<string, unknown>;
            return (
              <li key={entry.id} className="text-sm">
                <span className="font-medium">
                  {entry.userName ??
                    t("settings:projectStatus.history.someone")}
                </span>{" "}
                {describe(entry)}
                {entry.type === "health_changed" &&
                  typeof data.note === "string" &&
                  data.note && (
                    <span className="text-muted-foreground">
                      {" "}
                      · {data.note}
                    </span>
                  )}
                <span className="ml-2 text-muted-foreground text-xs">
                  {formatDateMedium(entry.createdAt)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
