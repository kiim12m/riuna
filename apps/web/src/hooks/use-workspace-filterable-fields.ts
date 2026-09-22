import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useGetActiveWorkspaceUsers } from "@/hooks/queries/workspace-users/use-get-active-workspace-users";
import { getPriorityLabel } from "@/lib/i18n/domain";
import type { FilterableField } from "@/types/task-filter";

/**
 * Los campos por los que se puede filtrar en "Mis tareas": los mismos fijos
 * que un proyecto, salvo `status`, que compara contra las columnas de **un**
 * proyecto y mentiria en otro (ADR 038). Sin campos personalizados todavia:
 * no hay endpoint que liste los de espacio fuera del motor de filtros.
 */
export function useWorkspaceFilterableFields(workspaceId: string) {
  const { t } = useTranslation();
  const { data: workspaceUsers } = useGetActiveWorkspaceUsers(workspaceId);

  return useMemo<FilterableField[]>(() => {
    const members = workspaceUsers?.members ?? [];

    return [
      {
        key: "title",
        label: t("tasks:table.columns.title"),
        valueType: "text",
      },
      {
        key: "priority",
        label: t("tasks:table.columns.priority"),
        valueType: "id",
        options: ["urgent", "high", "medium", "low"].map((value) => ({
          value,
          label: getPriorityLabel(value),
        })),
      },
      {
        key: "dueDate",
        label: t("tasks:table.columns.dueDate"),
        valueType: "date",
      },
      {
        key: "assignee",
        label: t("tasks:table.columns.assignee"),
        valueType: "id",
        options: members.map((member) => ({
          value: member.userId,
          label: member.user?.name ?? "",
        })),
      },
      {
        key: "done",
        label: t("tasks:table.columns.done"),
        valueType: "boolean",
        options: [
          { value: "true", label: t("common:boolean.yes") },
          { value: "false", label: t("common:boolean.no") },
        ],
      },
      {
        key: "completedAt",
        label: t("tasks:table.columns.completedAt"),
        valueType: "date",
      },
    ];
  }, [workspaceUsers, t]);
}

export default useWorkspaceFilterableFields;
