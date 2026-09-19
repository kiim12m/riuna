import { useState } from "react";
import { useTranslation } from "react-i18next";
import FilterBar from "@/components/table-view/filter-bar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
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
import type {
  Widget,
  WidgetConfig,
  WidgetGroupBy,
  WidgetType,
} from "@/fetchers/dashboard";
import { useGetGoals } from "@/hooks/queries/goal/use-goals";
import useGetProjects from "@/hooks/queries/project/use-get-projects";
import type { EditableCondition } from "@/types/task-filter";
import { useWidgetFields } from "./use-widget-fields";

const TYPES: WidgetType[] = [
  "count",
  "breakdown",
  "trend",
  "time",
  "epic_progress",
  "table",
  "inbox",
  "goal",
];

/** Que agrupaciones ofrece cada tipo. Es el espejo de `resolveWidget`. */
const GROUP_BY_BY_TYPE: Partial<Record<WidgetType, WidgetGroupBy[]>> = {
  breakdown: [
    "project",
    "assignee",
    "priority",
    "team",
    "status",
    "done",
    "dueWindow",
  ],
  time: ["assignee", "project", "time"],
};

export type WidgetDraft = {
  type: WidgetType;
  title: string;
  projectId: string | null;
  /** Solo lo usa el widget de objetivo. */
  goalId: string | null;
  config: WidgetConfig;
  span: number;
};

export function WidgetEditor({
  open,
  workspaceId,
  widget,
  onClose,
  onSave,
}: {
  open: boolean;
  workspaceId: string;
  widget?: Widget;
  onClose: () => void;
  onSave: (draft: WidgetDraft) => void;
}) {
  const { t } = useTranslation();
  const { data: projects = [] } = useGetProjects({ workspaceId });
  const { data: goals = [] } = useGetGoals(workspaceId);

  const [draft, setDraft] = useState<WidgetDraft>(() => ({
    type: (widget?.type as WidgetType) ?? "count",
    title: widget?.title ?? "",
    projectId: widget?.projectId ?? null,
    goalId: widget?.goalId ?? null,
    config: (widget?.config as WidgetConfig) ?? {},
    span: widget?.span ?? 1,
  }));

  const fields = useWidgetFields(draft.projectId, workspaceId);
  const groupByOptions = GROUP_BY_BY_TYPE[draft.type] ?? [];

  // Las epicas son de un proyecto, asi que ese tipo no admite ambito de espacio.
  const requiresProject = draft.type === "epic_progress";
  // Y un widget de objetivo tiene que nombrar uno.
  const requiresGoal = draft.type === "goal";
  // Y `status` compara slugs de un proyecto concreto.
  const availableGroupBy = draft.projectId
    ? groupByOptions
    : groupByOptions.filter((option) => option !== "status");

  const canSave =
    draft.title.trim().length > 0 &&
    (!requiresProject || Boolean(draft.projectId)) &&
    (!requiresGoal || Boolean(draft.goalId)) &&
    (groupByOptions.length === 0 || Boolean(draft.config.groupBy));

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {widget ? t("panels:widget.edit") : t("panels:widget.add")}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="widget-type">{t("panels:widget.type")}</Label>
              <Select
                value={draft.type}
                onValueChange={(value) =>
                  setDraft((previous) => ({
                    ...previous,
                    type: value as WidgetType,
                    // Cambiar de tipo invalida la agrupacion anterior: cada uno
                    // ofrece las suyas.
                    config: { ...previous.config, groupBy: undefined },
                  }))
                }
              >
                <SelectTrigger id="widget-type">
                  <SelectValue>{t(`panels:type.${draft.type}`)}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {t(`panels:type.${type}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="widget-title">{t("panels:widget.title")}</Label>
              <Input
                id="widget-title"
                value={draft.title}
                onChange={(event) =>
                  setDraft((p) => ({ ...p, title: event.target.value }))
                }
                placeholder={t(`panels:type.${draft.type}`)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="widget-project">{t("panels:widget.scope")}</Label>
              <Select
                value={draft.projectId ?? "workspace"}
                onValueChange={(value) =>
                  setDraft((p) => ({
                    ...p,
                    projectId: value === "workspace" ? null : value,
                    config:
                      value === "workspace" && p.config.groupBy === "status"
                        ? { ...p.config, groupBy: undefined }
                        : p.config,
                  }))
                }
              >
                <SelectTrigger id="widget-project">
                  <SelectValue>
                    {draft.projectId
                      ? (projects.find((p) => p.id === draft.projectId)?.name ??
                        "")
                      : t("panels:widget.wholeWorkspace")}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {!requiresProject && (
                    <SelectItem value="workspace">
                      {t("panels:widget.wholeWorkspace")}
                    </SelectItem>
                  )}
                  {projects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {requiresGoal && (
              <div className="space-y-1.5">
                <Label htmlFor="widget-goal">{t("panels:widget.goal")}</Label>
                <Select
                  value={draft.goalId ?? ""}
                  onValueChange={(next) =>
                    setDraft((current) => ({
                      ...current,
                      goalId: typeof next === "string" ? next : null,
                    }))
                  }
                >
                  <SelectTrigger id="widget-goal">
                    <SelectValue>
                      {goals.find((goal) => goal.id === draft.goalId)?.name ??
                        t("panels:widget.pickGoal")}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {goals.map((goal) => (
                      <SelectItem key={goal.id} value={goal.id}>
                        {goal.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {availableGroupBy.length > 0 && (
              <div className="space-y-1.5">
                <Label htmlFor="widget-groupby">
                  {t("panels:widget.groupBy")}
                </Label>
                <Select
                  value={draft.config.groupBy ?? ""}
                  onValueChange={(value) =>
                    setDraft((p) => ({
                      ...p,
                      config: { ...p.config, groupBy: value as WidgetGroupBy },
                    }))
                  }
                >
                  <SelectTrigger id="widget-groupby">
                    <SelectValue>
                      {draft.config.groupBy
                        ? t(`panels:groupBy.${draft.config.groupBy}`)
                        : t("panels:widget.pickGroupBy")}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {availableGroupBy.map((option) => (
                      <SelectItem key={option} value={option}>
                        {t(`panels:groupBy.${option}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>{t("panels:widget.filter")}</Label>
            <FilterBar
              fields={fields}
              conditions={(draft.config.filter ?? []) as EditableCondition[]}
              onChange={(conditions) =>
                setDraft((p) => ({
                  ...p,
                  config: { ...p.config, filter: conditions },
                }))
              }
            />
          </div>
        </div>

        <DialogFooter>
          <DialogClose render={<Button variant="outline" size="sm" />}>
            {t("common:actions.cancel")}
          </DialogClose>
          <Button size="sm" disabled={!canSave} onClick={() => onSave(draft)}>
            {t("common:actions.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
