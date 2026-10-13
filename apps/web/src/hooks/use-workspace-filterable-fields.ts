import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/components/providers/auth-provider/hooks/use-auth";
import type { FieldDefinition } from "@/components/table-view/custom-field-cell";
import { useGetWorkspaceFieldDefinitions } from "@/hooks/queries/field/use-get-field-definitions";
import { useGetActiveWorkspaceUsers } from "@/hooks/queries/workspace-users/use-get-active-workspace-users";
import {
  customFieldsToFilterable,
  watchersFilterField,
} from "@/hooks/use-filterable-fields";
import { getPriorityLabel } from "@/lib/i18n/domain";
import type { FilterableField } from "@/types/task-filter";

/**
 * Los campos por los que se puede filtrar en "Mis tareas": los mismos fijos
 * que un proyecto, salvo `status`, que compara contra las columnas de **un**
 * proyecto y mentiria en otro (ADR 038), mas los campos personalizados **del
 * espacio** por los que el servidor deja filtrar entre proyectos.
 */
export function useWorkspaceFilterableFields(workspaceId: string) {
  const { t } = useTranslation();
  const { data: workspaceUsers } = useGetActiveWorkspaceUsers(workspaceId);
  const { data: workspaceFields = [] } =
    useGetWorkspaceFieldDefinitions(workspaceId);
  const { user } = useAuth();

  return useMemo<FilterableField[]>(() => {
    const members = workspaceUsers?.members ?? [];
    const custom = customFieldsToFilterable(
      (
        workspaceFields as Array<FieldDefinition & { filterable?: boolean }>
      ).filter((field) => field.filterable),
      t,
    );

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
      watchersFilterField(members, user?.id, t),
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
      {
        key: "milestone",
        label: t("tasks:table.columns.milestone"),
        valueType: "boolean",
        options: [
          { value: "true", label: t("common:boolean.yes") },
          { value: "false", label: t("common:boolean.no") },
        ],
      },
      ...custom,
    ];
  }, [workspaceUsers, workspaceFields, user?.id, t]);
}

export default useWorkspaceFilterableFields;
