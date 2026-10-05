import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import PageTitle from "@/components/page-title";
import ColumnEditor from "@/components/project/column-editor";
import EpicEditor from "@/components/project/epic-editor";
import FieldEditor from "@/components/project/field-editor";
import RecurrenceEditor from "@/components/project/recurrence-editor";
import TemplatePanel from "@/components/project/template-panel";
import TreeSettings from "@/components/project/tree-settings";
import WorkflowEditor from "@/components/project/workflow-editor";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/workspace/$workspaceId/admin/project-settings/$projectId/workflow",
)({
  component: RouteComponent,
});

function RouteComponent() {
  const { t } = useTranslation();
  const { projectId, workspaceId } = Route.useParams();
  const { canUpdateProjects } = useWorkspacePermission();

  return (
    <>
      <PageTitle title={t("settings:projectWorkflow.pageTitle")} />
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="space-y-2">
          <h1 className="text-page">{t("settings:projectWorkflow.title")}</h1>
          <p className="text-muted-foreground">
            {t("settings:projectWorkflow.subtitle")}
          </p>
        </div>

        <div className="space-y-6">
          <div className="space-y-1">
            <h2 className="text-md font-medium">
              {t("settings:projectWorkflow.columnsTitle")}
            </h2>
            <p className="text-xs text-muted-foreground">
              {t("settings:projectWorkflow.columnsDescription")}
            </p>
          </div>
          <ColumnEditor projectId={projectId} />
        </div>

        <div className="space-y-6">
          <div className="space-y-1">
            <h2 className="text-md font-medium">
              {t("settings:projectTree.title")}
            </h2>
            <p className="text-xs text-muted-foreground">
              {t("settings:projectTree.description")}
            </p>
          </div>
          <TreeSettings projectId={projectId} />
        </div>

        <div className="space-y-6">
          <div className="space-y-1">
            <h2 className="text-md font-medium">
              {t("settings:projectEpics.title")}
            </h2>
            <p className="text-xs text-muted-foreground">
              {t("settings:projectEpics.description")}
            </p>
          </div>
          <EpicEditor projectId={projectId} />
        </div>

        <div className="space-y-6">
          <div className="space-y-1">
            <h2 className="text-md font-medium">
              {t("settings:projectFields.title")}
            </h2>
            <p className="text-xs text-muted-foreground">
              {t("settings:projectFields.description")}
            </p>
          </div>
          <FieldEditor
            projectId={projectId}
            workspaceId={workspaceId}
            canEdit={canUpdateProjects()}
          />
        </div>

        <div className="space-y-6">
          <div className="space-y-1">
            <h2 className="text-md font-medium">
              {t("settings:projectRecurrences.title")}
            </h2>
            <p className="text-xs text-muted-foreground">
              {t("settings:projectRecurrences.description")}
            </p>
          </div>
          <RecurrenceEditor projectId={projectId} />
        </div>

        <div className="space-y-6">
          <div className="space-y-1">
            <h2 className="text-md font-medium">
              {t("settings:projectTemplates.title")}
            </h2>
            <p className="text-xs text-muted-foreground">
              {t("settings:projectTemplates.description")}
            </p>
          </div>
          <TemplatePanel projectId={projectId} />
        </div>

        <div className="space-y-6">
          <div className="space-y-1">
            <h2 className="text-md font-medium">
              {t("settings:projectWorkflow.automationTitle")}
            </h2>
            <p className="text-xs text-muted-foreground">
              {t("settings:projectWorkflow.automationDescription")}
            </p>
          </div>
          <WorkflowEditor projectId={projectId} canEdit={canUpdateProjects()} />
        </div>
      </div>
    </>
  );
}
