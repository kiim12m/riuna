import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { FieldDefinition } from "@/components/table-view/custom-field-cell";
import { useGetWorkspaceFieldDefinitions } from "@/hooks/queries/field/use-get-field-definitions";
import {
  customFieldsToFilterable,
  useFilterableFields,
} from "@/hooks/use-filterable-fields";
import type { FilterableField } from "@/types/task-filter";

/**
 * Los campos por los que un widget puede filtrar, segun su ambito.
 *
 * Es el reflejo en la interfaz de lo que hace `buildWorkspaceFieldRegistry` en
 * la API: sin proyecto se retira `status`, cuyos valores validos son los slugs
 * de las columnas de **un** proyecto, y su sustituto entre proyectos es `done`.
 * Si divergieran, el servidor devolveria un 400 en vez de producir SQL rara.
 *
 * Un widget de espacio ofrece ademas los campos personalizados **del espacio**
 * por los que el servidor deja filtrar entre proyectos (`filterable`).
 */
export function useWidgetFields(
  projectId: string | null,
  workspaceId: string,
): FilterableField[] {
  const { t } = useTranslation();
  const projectFields = useFilterableFields(projectId ?? "", workspaceId);
  const { data: workspaceFields = [] } = useGetWorkspaceFieldDefinitions(
    projectId ? "" : workspaceId,
  );

  return useMemo(() => {
    if (projectId) return projectFields;

    const custom = customFieldsToFilterable(
      (
        workspaceFields as Array<FieldDefinition & { filterable?: boolean }>
      ).filter((field) => field.filterable),
      t,
    );

    return [
      ...projectFields.filter((field) => field.key !== "status"),
      {
        key: "project",
        label: t("panels:groupBy.project"),
        valueType: "id" as const,
      },
      ...custom,
    ];
  }, [projectFields, workspaceFields, projectId, t]);
}
