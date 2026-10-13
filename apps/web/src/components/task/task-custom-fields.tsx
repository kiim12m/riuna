import { SlidersHorizontal } from "lucide-react";
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
import { cn } from "@/lib/cn";
import { toast } from "@/lib/toast";
import type Task from "@/types/task";

type Props = {
  task: Task | null | undefined;
  projectId: string;
  workspaceId: string;
  /**
   * `sidebar`, una lista en la columna de propiedades; `section`, una tarjeta
   * a dos columnas en el cuerpo de la tarea, como «Tiempo».
   */
  variant?: "sidebar" | "section";
  className?: string;
};

/**
 * Los campos personalizados dentro del detalle de la tarea.
 *
 * Salen en dos sitios: en la columna de propiedades de la pagina completa y,
 * en el cajon y por debajo de `lg`, como seccion del cuerpo. En la barra de
 * chips no caben: estiraban la fila hasta la altura de todos los campos y la
 * cabecera fija se comia medio cajon.
 *
 * Reutiliza la celda de la vista Tabla: un campo de moneda tiene que
 * escribirse y verse igual en los dos sitios, y dos editores separados
 * divergen en la primera correccion que se haga solo en uno.
 */
function TaskCustomFields({
  task,
  projectId,
  workspaceId,
  variant = "sidebar",
  className,
}: Props) {
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

  const rows = (definitions as FieldDefinition[]).map((definition) => (
    <div
      key={definition.id}
      className={cn(
        "flex items-center gap-2 py-0.5",
        variant === "sidebar" && "px-1.5",
      )}
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
  ));

  if (variant === "section") {
    return (
      <section
        className={cn(
          "flex flex-col gap-2 rounded-md border border-border/60 p-3",
          className,
        )}
        data-testid="task-custom-fields"
      >
        <h2 className="flex items-center gap-1.5 text-section">
          <SlidersHorizontal className="size-4" />
          {t("tasks:properties.customFields")}
        </h2>
        <div className="grid gap-x-6 gap-y-0.5 md:grid-cols-2">{rows}</div>
      </section>
    );
  }

  return (
    <div className={cn("space-y-1", className)}>
      <p className="px-1.5 text-label font-medium uppercase text-muted-foreground">
        {t("tasks:properties.customFields")}
      </p>
      {rows}
    </div>
  );
}

export default TaskCustomFields;
