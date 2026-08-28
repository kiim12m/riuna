import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { FieldDefinition } from "@/components/table-view/custom-field-cell";
import useGetFieldDefinitions from "@/hooks/queries/field/use-get-field-definitions";
import { useGetActiveWorkspaceUsers } from "@/hooks/queries/workspace-users/use-get-active-workspace-users";
import { getPriorityLabel } from "@/lib/i18n/domain";
import type { FilterableField, FilterValueType } from "@/types/task-filter";

// Como se compara cada tipo de campo personalizado. Es el mismo reparto que
// `CUSTOM_FIELD_VALUE_TYPES` en la API; si divergen, el servidor rechaza el
// filtro con un 400 en vez de producir SQL rara.
const CUSTOM_FIELD_VALUE_TYPES: Record<string, FilterValueType | undefined> = {
  text: "text",
  number: "number",
  currency: "number",
  select: "id",
  multi_select: "id",
  date: "date",
  checkbox: "boolean",
  user: "id",
  url: "text",
};

/**
 * Los campos por los que se puede filtrar en un proyecto: los fijos que el
 * motor conoce mas los personalizados que apliquen.
 *
 * Va en un hook compartido porque las cinco vistas ofrecen la misma lista. Con
 * una copia por vista, anadir un tipo de campo obliga a acordarse de cinco
 * sitios, que es exactamente como la ficha de epicas de la Fase 2 acabo
 * faltando en dos de las tres disposiciones del lateral.
 */
export function useFilterableFields(projectId: string, workspaceId: string) {
  const { t } = useTranslation();
  const { data: definitions = [] } = useGetFieldDefinitions(projectId);
  const { data: workspaceUsers } = useGetActiveWorkspaceUsers(workspaceId);

  return useMemo<FilterableField[]>(() => {
    const members = workspaceUsers?.members ?? [];

    const builtIn: FilterableField[] = [
      {
        key: "title",
        label: t("tasks:table.columns.title"),
        valueType: "text",
      },
      {
        key: "status",
        label: t("tasks:table.columns.status"),
        valueType: "id",
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
    ];

    // Los de tipo relacion se quedan fuera: su valor no vive en el JSONB y el
    // registro del motor no los incluye.
    const custom = (definitions as FieldDefinition[]).flatMap((definition) => {
      const valueType = CUSTOM_FIELD_VALUE_TYPES[definition.type];
      if (!valueType) return [];

      const options = Array.isArray(definition.config?.options)
        ? (definition.config.options as Array<{ value: string; label: string }>)
        : undefined;

      return [
        {
          key: `custom.${definition.key}`,
          label: definition.name,
          valueType,
          options,
        },
      ];
    });

    return [...builtIn, ...custom];
  }, [definitions, workspaceUsers, t]);
}

export default useFilterableFields;
