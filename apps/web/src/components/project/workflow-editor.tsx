import { useTranslation } from "react-i18next";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDeleteWorkflowRule } from "@/hooks/mutations/workflow-rule/use-delete-workflow-rule";
import { useUpsertWorkflowRule } from "@/hooks/mutations/workflow-rule/use-upsert-workflow-rule";
import { useGetColumns } from "@/hooks/queries/column/use-get-columns";
import { useGetWorkflowRules } from "@/hooks/queries/workflow-rule/use-get-workflow-rules";
import { toast } from "@/lib/toast";

// Los eventos que GitHub y Gitea resuelven con una regla (`resolveTargetStatus`).
const INTEGRATION_EVENT_TYPES = [
  "branch_push",
  "pr_opened",
  "pr_merged",
  "issue_opened",
  "issue_closed",
  "issue_reopened",
] as const;

// Sin regla, la integracion cae a la columna de su evento o a la primera.
// Ningun id de columna (cuid2) puede valer esto.
const DEFAULT_VALUE = "default";

type WorkflowEditorProps = {
  projectId: string;
  /** Sin `project:update` se ven las reglas pero no se tocan, como en los campos. */
  canEdit?: boolean;
};

export default function WorkflowEditor({
  projectId,
  canEdit = true,
}: WorkflowEditorProps) {
  const { t } = useTranslation();
  const { data: columns, isLoading: columnsLoading } = useGetColumns(projectId);
  const { data: rules, isLoading: rulesLoading } =
    useGetWorkflowRules(projectId);
  const { mutateAsync: upsertRule } = useUpsertWorkflowRule();
  const { mutateAsync: deleteRule } = useDeleteWorkflowRule();

  if (columnsLoading || rulesLoading) {
    return (
      <div className="text-sm text-muted-foreground">
        {t("settings:workflowEditor.loading")}
      </div>
    );
  }

  if (!columns || columns.length === 0) {
    return (
      <div className="text-sm text-muted-foreground">
        {t("settings:workflowEditor.createColumnsFirst")}
      </div>
    );
  }

  const renderRuleSection = (
    integrationType: "github" | "gitea",
    headingKey: "githubHeading" | "giteaHeading",
    hintKey: "githubHint" | "giteaHint",
  ) => (
    <div className="space-y-4">
      <div className="space-y-1">
        <h3 className="text-sm font-medium">
          {t(`settings:workflowEditor.${headingKey}`)}
        </h3>
        <p className="text-xs text-muted-foreground">
          {t(`settings:workflowEditor.${hintKey}`)}
        </p>
      </div>

      <div className="space-y-2">
        {INTEGRATION_EVENT_TYPES.map((eventType) => {
          const currentRule = rules?.find(
            (r) =>
              r.integrationType === integrationType &&
              r.eventType === eventType,
          );

          return (
            <div
              key={`${integrationType}-${eventType}`}
              data-testid={`workflow-rule-${integrationType}-${eventType}`}
              className="flex items-center justify-between gap-4 p-3 border border-border rounded-md bg-sidebar"
            >
              <span className="text-sm">
                {t(`settings:workflowEditor.events.${eventType}`)}
              </span>
              <Select
                value={currentRule?.columnId ?? DEFAULT_VALUE}
                disabled={!canEdit}
                onValueChange={async (value) => {
                  if (!value) return;
                  try {
                    if (value === DEFAULT_VALUE) {
                      if (!currentRule) return;
                      await deleteRule({ id: currentRule.id, projectId });
                      toast.success(t("settings:workflowEditor.toastRemoved"));
                      return;
                    }
                    await upsertRule({
                      projectId,
                      data: {
                        integrationType,
                        eventType,
                        columnId: value,
                      },
                    });
                    toast.success(t("settings:workflowEditor.toastUpdated"));
                  } catch (error) {
                    toast.error(
                      error instanceof Error
                        ? error.message
                        : t("settings:workflowEditor.toastError"),
                    );
                  }
                }}
              >
                <SelectTrigger className="w-48 h-8 text-sm">
                  <SelectValue
                    placeholder={t(
                      "settings:workflowEditor.selectColumnPlaceholder",
                    )}
                  >
                    {columns.find((c) => c.id === currentRule?.columnId)
                      ?.name ?? t("settings:workflowEditor.defaultColumn")}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={DEFAULT_VALUE}>
                    {t("settings:workflowEditor.defaultColumn")}
                  </SelectItem>
                  {columns.map((col) => (
                    <SelectItem key={col.id} value={col.id}>
                      {col.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="space-y-10">
      <p className="text-xs text-muted-foreground">
        {t("settings:workflowEditor.defaultHint")}
      </p>
      {renderRuleSection("github", "githubHeading", "githubHint")}
      {renderRuleSection("gitea", "giteaHeading", "giteaHint")}
    </div>
  );
}
