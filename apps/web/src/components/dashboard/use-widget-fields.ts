import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useFilterableFields } from "@/hooks/use-filterable-fields";
import type { FilterableField } from "@/types/task-filter";

/**
 * Los campos por los que un widget puede filtrar, segun su ambito.
 *
 * Es el reflejo en la interfaz de lo que hace `buildWorkspaceFieldRegistry` en
 * la API: sin proyecto se retira `status`, cuyos valores validos son los slugs
 * de las columnas de **un** proyecto, y su sustituto entre proyectos es `done`.
 * Si divergieran, el servidor devolveria un 400 en vez de producir SQL rara.
 *
 * **Deuda declarada:** un widget de espacio todavia no ofrece los campos
 * personalizados **del espacio**, que la API si acepta. Falta el fetcher que los
 * lea sin pasar por un proyecto; va en la rebanada 2.
 */
export function useWidgetFields(
  projectId: string | null,
  workspaceId: string,
): FilterableField[] {
  const { t } = useTranslation();
  const projectFields = useFilterableFields(projectId ?? "", workspaceId);

  return useMemo(() => {
    if (projectId) return projectFields;

    return [
      ...projectFields.filter((field) => field.key !== "status"),
      {
        key: "project",
        label: t("panels:groupBy.project"),
        valueType: "id" as const,
      },
    ];
  }, [projectFields, projectId, t]);
}
