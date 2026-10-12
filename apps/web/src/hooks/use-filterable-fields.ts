import type { TFunction } from "i18next";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/components/providers/auth-provider/hooks/use-auth";
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
  multi_select: "idList",
  date: "date",
  checkbox: "boolean",
  user: "id",
  url: "text",
};

/**
 * Los campos personalizados como campos filtrables. Los de tipo relacion se
 * quedan fuera: su valor no vive en el JSONB y el registro del motor no los
 * incluye. Lo comparten el proyecto, «Mis tareas» y los widgets de espacio.
 */
export function customFieldsToFilterable(
  definitions: FieldDefinition[],
  t: TFunction,
): FilterableField[] {
  return definitions.flatMap((definition) => {
    const valueType = CUSTOM_FIELD_VALUE_TYPES[definition.type];
    if (!valueType) return [];

    // Una casilla no declara opciones —su configuracion esta vacia— pero sin
    // ellas la barra caia al campo de texto libre, mandaba la cadena "true" y
    // el motor la rechazaba con un 400: no habia ningun valor tecleable que
    // funcionase. Se las damos aqui.
    const options =
      valueType === "boolean"
        ? [
            { value: "true", label: t("common:boolean.yes") },
            { value: "false", label: t("common:boolean.no") },
          ]
        : Array.isArray(definition.config?.options)
          ? (definition.config.options as Array<{
              value: string;
              label: string;
            }>)
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
}

type MemberOption = {
  userId: string;
  user?: { name?: string | null } | null;
};

/**
 * «Observada por» (ADR 076): quien la observa a proposito. Quien mira va
 * primero y marcado, porque la pregunta casi siempre es «lo que observo yo».
 * Guarda el id, como el filtro de asignado: el motor no sabe decir «yo».
 */
export function watchersFilterField(
  members: MemberOption[],
  currentUserId: string | undefined,
  t: TFunction,
): FilterableField {
  const options = members.map((member) => ({
    value: member.userId,
    label: member.user?.name ?? "",
  }));
  const mine = options.findIndex((option) => option.value === currentUserId);
  if (mine >= 0) {
    const [me] = options.splice(mine, 1);
    if (me) {
      options.unshift({
        ...me,
        label: `${me.label} ${t("tasks:watchers.you")}`,
      });
    }
  }

  return {
    key: "watchers",
    label: t("tasks:table.columns.watchers"),
    valueType: "id",
    options,
  };
}

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
  const { user } = useAuth();

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
      watchersFilterField(members, user?.id, t),
      // "Hecha" es `completed_at IS NOT NULL`, que es la definicion unica del
      // producto. Filtrar por `status` obliga a saber el slug de la columna
      // final de **este** proyecto; esto no.
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

    const custom = customFieldsToFilterable(
      definitions as FieldDefinition[],
      t,
    );

    return [...builtIn, ...custom];
  }, [definitions, workspaceUsers, user?.id, t]);
}

export default useFilterableFields;
