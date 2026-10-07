import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useWidgetFields } from "@/components/dashboard/use-widget-fields";
import FilterBar from "@/components/table-view/filter-bar";
import { Button } from "@/components/ui/button";
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
import type {
  Action,
  Automation,
  AutomationInput,
  AutomationScope,
  TriggerType,
} from "@/fetchers/automation";
import { useSaveAutomation } from "@/hooks/queries/automation/use-automations";
import { toast } from "@/lib/toast";
import { ActionFields } from "./action-fields";
import { OptionSelect } from "./fields";
import {
  actionTypesFor,
  type EditorScope,
  emptyDraft,
  moveItem,
  newAction,
  newTrigger,
  toDraft,
  toInput,
  triggerTypesFor,
} from "./model";
import { TriggerFields } from "./trigger-fields";
import { useAutomationOptions } from "./use-automation-options";

export const triggerLabelKey = (type: TriggerType) =>
  `settings:automations.triggers.${type.replace(".", "_")}`;

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3 rounded-lg border border-border p-3">
      <div className="space-y-0.5">
        <h3 className="text-sm font-medium">{title}</h3>
        {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

/**
 * El editor de una regla: «Cuando · Si · Entonces» (ADR 066). La condicion es
 * la misma barra de filtros que las vistas, asi que significa lo mismo.
 */
export function AutomationEditor({
  open,
  onOpenChange,
  scope,
  target,
  workspaceId,
  projectId,
  automation,
  initialDraft,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scope: EditorScope;
  target: AutomationScope;
  workspaceId: string;
  projectId: string | null;
  automation: Automation | null;
  initialDraft: AutomationInput | null;
}) {
  const { t } = useTranslation();
  const e = (key: string) => t(`settings:automations.editor.${key}`);
  const [draft, setDraft] = useState<AutomationInput>(
    () => initialDraft ?? (automation ? toDraft(automation) : emptyDraft()),
  );
  const options = useAutomationOptions(workspaceId, projectId);
  const fields = useWidgetFields(projectId, workspaceId);
  const save = useSaveAutomation(target);

  const setAction = (index: number, action: Action) =>
    setDraft((current) => ({
      ...current,
      actions: current.actions.map((item, i) => (i === index ? action : item)),
    }));

  const submit = async () => {
    try {
      await save.mutateAsync({ id: automation?.id, input: toInput(draft) });
      toast.success(e("saved"));
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : e("saveError"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {automation ? e("editTitle") : e("newTitle")}
          </DialogTitle>
        </DialogHeader>

        <DialogPanel className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="automation-name">{e("name")}</Label>
            <Input
              id="automation-name"
              value={draft.name}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  name: event.target.value,
                }))
              }
            />
          </div>

          <Section title={e("when")}>
            <OptionSelect
              label={e("trigger")}
              value={draft.trigger.type}
              options={triggerTypesFor(scope).map((type) => ({
                id: type,
                name: t(triggerLabelKey(type)),
              }))}
              onChange={(type) =>
                setDraft((current) => ({
                  ...current,
                  trigger: newTrigger(type as TriggerType),
                }))
              }
            />
            <TriggerFields
              trigger={draft.trigger}
              scope={scope}
              options={options}
              onChange={(trigger) =>
                setDraft((current) => ({ ...current, trigger }))
              }
            />
          </Section>

          <Section title={e("if")} hint={e("ifHint")}>
            <FilterBar
              fields={fields}
              conditions={draft.conditions ?? []}
              onChange={(conditions) =>
                setDraft((current) => ({ ...current, conditions }))
              }
            />
          </Section>

          <Section title={e("then")} hint={e("thenHint")}>
            <ol className="space-y-3">
              {draft.actions.map((action, index) => (
                <li
                  key={action.id}
                  data-testid="automation-action"
                  className="space-y-3 rounded-md bg-muted/30 p-3"
                >
                  <div className="flex items-center gap-2">
                    <span className="flex-1 text-sm font-medium">
                      {index + 1}.{" "}
                      {t(`settings:automations.actions.${action.type}`)}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label={e("moveUp")}
                      disabled={index === 0}
                      onClick={() =>
                        setDraft((current) => ({
                          ...current,
                          actions: moveItem(current.actions, index, index - 1),
                        }))
                      }
                    >
                      <ArrowUp />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label={e("moveDown")}
                      disabled={index === draft.actions.length - 1}
                      onClick={() =>
                        setDraft((current) => ({
                          ...current,
                          actions: moveItem(current.actions, index, index + 1),
                        }))
                      }
                    >
                      <ArrowDown />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label={e("removeAction")}
                      onClick={() =>
                        setDraft((current) => ({
                          ...current,
                          actions: current.actions.filter(
                            (_, i) => i !== index,
                          ),
                        }))
                      }
                    >
                      <Trash2 />
                    </Button>
                  </div>
                  <ActionFields
                    action={action}
                    scope={scope}
                    options={options}
                    onChange={(next) => setAction(index, next)}
                  />
                </li>
              ))}
            </ol>
            {draft.actions.length < 10 && (
              <OptionSelect
                value=""
                placeholder={e("addAction")}
                options={actionTypesFor(scope).map((type) => ({
                  id: type,
                  name: t(`settings:automations.actions.${type}`),
                }))}
                onChange={(type) =>
                  type &&
                  setDraft((current) => ({
                    ...current,
                    actions: [
                      ...current.actions,
                      newAction(type as Action["type"]),
                    ],
                  }))
                }
              />
            )}
          </Section>
        </DialogPanel>

        <DialogFooter>
          <DialogClose render={<Button variant="outline" size="sm" />}>
            {e("cancel")}
          </DialogClose>
          <Button
            size="sm"
            disabled={
              save.isPending ||
              draft.name.trim() === "" ||
              draft.actions.length === 0
            }
            onClick={submit}
          >
            {e("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
