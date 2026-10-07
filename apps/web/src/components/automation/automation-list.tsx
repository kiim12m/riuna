import { History, Pencil, Plus, Trash2, Zap } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import type {
  Automation,
  AutomationInput,
  AutomationScope,
} from "@/fetchers/automation";
import {
  useArchiveAutomation,
  useGetAutomations,
  useSetAutomationEnabled,
} from "@/hooks/queries/automation/use-automations";
import useGetTeams from "@/hooks/queries/team/use-get-teams";
import { formatRelativeTime } from "@/lib/format";
import { toast } from "@/lib/toast";
import { AutomationEditor, triggerLabelKey } from "./automation-editor";
import { AutomationRuns, RUN_BADGE } from "./automation-runs";
import { OptionSelect } from "./fields";
import { type EditorScope, RECIPES } from "./model";
import { StandupScheduleEditor } from "./standup-schedule";

type Editing = {
  key: number;
  automation: Automation | null;
  draft: AutomationInput | null;
};

/**
 * Las reglas de un proyecto o del espacio (3.1): activarlas, ver que hicieron
 * y editarlas. Las recetas (3.3) solo rellenan el editor.
 */
export function AutomationList({
  scope,
  target,
  workspaceId,
  projectId,
  canEdit,
}: {
  scope: EditorScope;
  target: AutomationScope;
  workspaceId: string;
  projectId: string | null;
  canEdit: boolean;
}) {
  const { t } = useTranslation();
  const a = (key: string, options?: Record<string, unknown>) =>
    t(`settings:automations.${key}`, options);
  const { data: automations, isPending } = useGetAutomations(target, canEdit);
  const setEnabled = useSetAutomationEnabled();
  const archive = useArchiveAutomation();
  const [editing, setEditing] = useState<Editing | null>(null);
  const { data: teamRows = [] } = useGetTeams({ workspaceId });
  const teams = teamRows as Array<{ id: string; name: string }>;
  const [history, setHistory] = useState<Automation | null>(null);
  const [archiving, setArchiving] = useState<Automation | null>(null);

  const open = (automation: Automation | null, draft: AutomationInput | null) =>
    setEditing({ key: Date.now(), automation, draft });

  const toggle = async (automation: Automation, enabled: boolean) => {
    try {
      await setEnabled.mutateAsync({ id: automation.id, enabled });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : a("editor.saveError"),
      );
    }
  };

  const confirmArchive = async () => {
    if (!archiving) return;
    await archive.mutateAsync(archiving.id);
    setArchiving(null);
    toast.success(a("archived"));
  };

  if (!canEdit) {
    return <p className="text-muted-foreground text-sm">{a("noPermission")}</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => open(null, null)}>
          <Plus />
          {a("newRule")}
        </Button>
        <div className="w-60">
          <OptionSelect
            value=""
            placeholder={a("fromRecipe")}
            options={RECIPES.filter((recipe) =>
              recipe.scopes.includes(scope),
            ).map((recipe) => ({
              id: recipe.key,
              name: a(`recipes.${recipe.key}.name`),
            }))}
            onChange={(key) => {
              const recipe = RECIPES.find((item) => item.key === key);
              if (!recipe) return;
              open(
                null,
                recipe.build({
                  name: a(`recipes.${recipe.key}.name`),
                  message: a(`recipes.${recipe.key}.message`),
                }),
              );
            }}
          />
        </div>
      </div>

      {isPending ? (
        <Skeleton className="h-16 w-full" />
      ) : (automations ?? []).length === 0 ? (
        <p className="text-muted-foreground text-sm">{a("empty")}</p>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">
          {(automations ?? []).map((automation) => (
            <li
              key={automation.id}
              data-testid="automation-row"
              className="space-y-2 p-3"
            >
              <div className="flex flex-wrap items-center gap-3">
                <Switch
                  aria-label={a("toggle", { name: automation.name })}
                  checked={automation.enabled}
                  onCheckedChange={(enabled) => toggle(automation, enabled)}
                />
                <div className="min-w-48 flex-1">
                  <p className="truncate text-sm font-medium">
                    {automation.name}
                  </p>
                  <p className="flex items-center gap-1 text-muted-foreground text-xs">
                    <Zap className="size-3" />
                    {t(triggerLabelKey(automation.trigger.type))}
                    {" · "}
                    {a("actionCount", { count: automation.actions.length })}
                  </p>
                </div>
                {/* En pantallas estrechas bajan a su propia linea: el nombre
                    no se puede partir letra a letra. */}
                <div className="ml-auto flex items-center gap-1">
                  {automation.lastRun && (
                    <Badge variant={RUN_BADGE[automation.lastRun.status]}>
                      {a(`status.${automation.lastRun.status}`)} ·{" "}
                      {formatRelativeTime(automation.lastRun.startedAt)}
                    </Badge>
                  )}
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={a("history", { name: automation.name })}
                    onClick={() => setHistory(automation)}
                  >
                    <History />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={a("edit", { name: automation.name })}
                    onClick={() => open(automation, null)}
                  >
                    <Pencil />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={a("archive", { name: automation.name })}
                    onClick={() => setArchiving(automation)}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </div>
              {automation.pausedReason && (
                <p
                  role="status"
                  className="rounded-md bg-warning/8 px-2 py-1 text-warning-foreground text-xs"
                >
                  {a(`paused.${automation.pausedReason}`, {
                    defaultValue: a("paused.generic"),
                  })}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      {editing?.automation?.trigger.type === "schedule" &&
        editing.automation.teamId && (
          <StandupScheduleEditor
            key={editing.key}
            workspaceId={workspaceId}
            teamId={editing.automation.teamId}
            teamName={
              teams.find((team) => team.id === editing.automation?.teamId)
                ?.name ?? ""
            }
            automation={editing.automation}
            onClose={() => setEditing(null)}
          />
        )}

      {editing && editing.automation?.trigger.type !== "schedule" && (
        <AutomationEditor
          key={editing.key}
          open
          onOpenChange={(next) => !next && setEditing(null)}
          scope={scope}
          target={target}
          workspaceId={workspaceId}
          projectId={projectId}
          automation={editing.automation}
          initialDraft={editing.draft}
        />
      )}

      <AutomationRuns
        automationId={history?.id ?? null}
        name={history?.name ?? ""}
        onClose={() => setHistory(null)}
      />

      <AlertDialog
        open={archiving !== null}
        onOpenChange={(next) => !next && setArchiving(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {a("archiveTitle", { name: archiving?.name ?? "" })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {a("archiveDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button variant="outline" onClick={() => setArchiving(null)}>
              {t("common:actions.cancel")}
            </Button>
            <Button variant="destructive" onClick={confirmArchive}>
              {a("archiveAction")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
