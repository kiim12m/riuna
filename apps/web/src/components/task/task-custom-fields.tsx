import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import CustomFieldCell, {
  type FieldDefinition,
  type FieldMember,
} from "@/components/table-view/custom-field-cell";
import { useUpdateTaskCustomFields } from "@/hooks/mutations/field/use-field-mutations";
import useGetFieldDefinitions from "@/hooks/queries/field/use-get-field-definitions";
import { useGetActiveWorkspaceUsers } from "@/hooks/queries/workspace-users/use-get-active-workspace-users";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { toast } from "@/lib/toast";
import type Task from "@/types/task";

type Props = {
  task: Task | null | undefined;
  projectId: string;
  workspaceId: string;
};

/**
 * Los campos personalizados dentro del detalle de la tarea.
 *
 * Va en un componente propio porque el lateral de propiedades pinta tres
 * disposiciones —compacta, movil y escritorio— y cada una tiene que
 * incluirlo. Repetir el bloque tres veces es como la ficha de epicas de la
 * Fase 2 acabo apareciendo en una sola de ellas.
 *
 * Reutiliza la celda de la vista Tabla: un campo de moneda tiene que
 * escribirse y verse igual en los dos sitios, y dos editores separados
 * divergen en la primera correccion que se haga solo en uno.
 */
function TaskCustomFields({ task, projectId, workspaceId }: Props) {
  const { t } = useTranslation();
  const { data: definitions = [] } = useGetFieldDefinitions(projectId);
  const { data: workspaceUsers } = useGetActiveWorkspaceUsers(workspaceId);
  const { mutate: setCustomField } = useUpdateTaskCustomFields(projectId);
  const { canUpdateTasks } = useWorkspacePermission();

  const members = useMemo<FieldMember[]>(
    () =>
      (workspaceUsers?.members ?? []).map((member) => ({
        id: member.userId,
        name: member.user?.name ?? "",
        image: member.user?.image ?? null,
      })),
    [workspaceUsers],
  );

  if (!task || definitions.length === 0) return null;

  const canEdit = canUpdateTasks();

  return (
    <div className="space-y-1">
      <p className="px-1.5 text-label font-medium uppercase text-muted-foreground">
        {t("tasks:properties.customFields")}
      </p>
      {(definitions as FieldDefinition[]).map((definition) => (
        <div
          key={definition.id}
          className="flex items-center gap-2 px-1.5 py-0.5"
        >
          <span className="w-[100px] shrink-0 truncate text-xs text-muted-foreground">
            {definition.name}
          </span>
          <div className="min-w-0 flex-1">
            <CustomFieldCell
              definition={definition}
              value={task.customFields?.[definition.key]}
              members={members}
              disabled={!canEdit}
              onCommit={(value) =>
                setCustomField(
                  { taskId: task.id, values: { [definition.key]: value } },
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
          </div>
        </div>
      ))}
    </div>
  );
}

export default TaskCustomFields;
