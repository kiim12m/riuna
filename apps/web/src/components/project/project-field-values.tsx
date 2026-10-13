import { useTranslation } from "react-i18next";
import CustomFieldCell, {
  type FieldDefinition,
} from "@/components/table-view/custom-field-cell";
import { useUpdateProjectCustomFields } from "@/hooks/mutations/project/use-update-project-custom-fields";
import { useGetWorkspaceFieldDefinitions } from "@/hooks/queries/field/use-get-field-definitions";
import { useGetActiveWorkspaceUsers } from "@/hooks/queries/workspace-users/use-get-active-workspace-users";
import { toast } from "@/lib/toast";

/**
 * Los campos de proyecto del espacio (ADR 088) con su valor en este proyecto,
 * editables en su sitio como una celda de la Tabla.
 */
export default function ProjectFieldValues({
  projectId,
  workspaceId,
  values,
  canEdit,
}: {
  projectId: string;
  workspaceId: string;
  values: Record<string, unknown>;
  canEdit: boolean;
}) {
  const { t } = useTranslation();
  const { data = [] } = useGetWorkspaceFieldDefinitions(workspaceId, {
    entity: "project",
  });
  const definitions = data as unknown as FieldDefinition[];
  const { data: workspaceUsers } = useGetActiveWorkspaceUsers(workspaceId);
  const members = (workspaceUsers?.members ?? []).map((member) => ({
    id: member.userId,
    name: member.user?.name ?? "",
    image: member.user?.image ?? null,
  }));
  const { mutate } = useUpdateProjectCustomFields(workspaceId);

  return (
    <div className="space-y-2">
      <h2 className="font-medium text-md">
        {t("settings:projectStatus.fieldsTitle")}
      </h2>
      {definitions.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {t("settings:projectStatus.fieldsEmpty")}
        </p>
      ) : (
        <dl
          className="grid gap-x-6 gap-y-2 sm:grid-cols-[minmax(8rem,auto)_1fr]"
          data-testid="project-field-values"
        >
          {definitions.map((definition) => (
            <div key={definition.key} className="contents">
              <dt className="py-1.5 text-muted-foreground text-sm">
                {definition.name}
              </dt>
              <dd>
                <CustomFieldCell
                  definition={definition}
                  value={values[definition.key]}
                  members={members}
                  disabled={!canEdit}
                  onCommit={(value) =>
                    mutate(
                      { projectId, values: { [definition.key]: value } },
                      {
                        onError: (error) =>
                          toast.error(
                            error instanceof Error
                              ? error.message
                              : t("tasks:table.saveFailed"),
                          ),
                      },
                    )
                  }
                />
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
