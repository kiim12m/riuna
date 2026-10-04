import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import PageTitle from "@/components/page-title";
import FieldEditor from "@/components/project/field-editor";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/workspace/$workspaceId/admin/workspace/fields",
)({
  component: RouteComponent,
});

/**
 * Los campos personalizados del espacio: valen para todos los proyectos. Crear,
 * renombrar, ordenar, archivar y borrar piden `workspace:manage_settings`, como
 * el resto de lo que afecta a todo el espacio.
 */
function RouteComponent() {
  const { t } = useTranslation();
  const { workspaceId } = Route.useParams();
  const { canManageSettings } = useWorkspacePermission();

  return (
    <>
      <PageTitle title={t("settings:workspaceFields.pageTitle")} />
      <div className="space-y-6">
        <div className="space-y-2">
          <h1 className="text-page">{t("settings:workspaceFields.title")}</h1>
          <p className="text-muted-foreground">
            {t("settings:workspaceFields.description")}
          </p>
        </div>
        <FieldEditor workspaceId={workspaceId} canEdit={canManageSettings()} />
      </div>
    </>
  );
}
