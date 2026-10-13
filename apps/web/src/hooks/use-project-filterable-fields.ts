import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { FieldDefinition } from "@/components/table-view/custom-field-cell";
import { useGetActiveWorkspaceUsers } from "@/hooks/queries/workspace-users/use-get-active-workspace-users";
import { customFieldsToFilterable } from "@/hooks/use-filterable-fields";
import { PROJECT_HEALTHS } from "@/lib/project-health";
import type { FilterableField } from "@/types/task-filter";

/**
 * Lo que se puede filtrar en la cartera (ADR 088): los campos del proyecto y
 * los campos de proyecto del espacio. Es la lista del registro de la API
 * (`portfolio-registry.ts`); si divergen, el servidor responde 400.
 */
export function useProjectFilterableFields(
  workspaceId: string,
  definitions: FieldDefinition[],
) {
  const { t } = useTranslation();
  const { data: workspaceUsers } = useGetActiveWorkspaceUsers(workspaceId);

  return useMemo<FilterableField[]>(() => {
    const members = workspaceUsers?.members ?? [];
    const builtIn: FilterableField[] = [
      { key: "name", label: t("workspace:projects.title"), valueType: "text" },
      { key: "key", label: t("workspace:projects.key"), valueType: "text" },
      {
        key: "health",
        label: t("workspace:projects.status"),
        valueType: "id",
        options: PROJECT_HEALTHS.map((health) => ({
          value: health,
          label: t(`workspace:projects.health.${health}`),
        })),
      },
      {
        key: "lead",
        label: t("workspace:projects.lead"),
        valueType: "id",
        options: members.map((member) => ({
          value: member.userId,
          label: member.user?.name ?? "",
        })),
      },
      {
        key: "startDate",
        label: t("workspace:projects.startDate"),
        valueType: "date",
      },
      {
        key: "endDate",
        label: t("workspace:projects.endDate"),
        valueType: "date",
      },
      {
        key: "progress",
        label: t("workspace:projects.progress"),
        valueType: "number",
      },
      {
        key: "createdAt",
        label: t("workspace:projects.createdAt"),
        valueType: "date",
      },
    ];
    return [...builtIn, ...customFieldsToFilterable(definitions, t)];
  }, [definitions, workspaceUsers, t]);
}
