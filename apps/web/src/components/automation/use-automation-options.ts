import { useMemo } from "react";
import type { FieldDefinition } from "@/components/table-view/custom-field-cell";
import { useGetColumns } from "@/hooks/queries/column/use-get-columns";
import useGetFieldDefinitions, {
  useGetWorkspaceFieldDefinitions,
} from "@/hooks/queries/field/use-get-field-definitions";
import useGetLabelsByWorkspace from "@/hooks/queries/label/use-get-labels-by-workspace";
import useGetTeams from "@/hooks/queries/team/use-get-teams";
import { useGetActiveWorkspaceUsers } from "@/hooks/queries/workspace-users/use-get-active-workspace-users";

export type Option = { id: string; name: string };

export type AutomationOptions = {
  columns: Option[];
  members: Option[];
  teams: Option[];
  /** Etiquetas del espacio: las que una accion puede poner. */
  labels: Option[];
  /** Los campos cuyo valor vive en la tarea: los de relacion no. */
  fields: FieldDefinition[];
};

/**
 * Lo que el editor ofrece en sus desplegables. Una regla de espacio no tiene
 * columnas y solo ve los campos del espacio, igual que su registro en la API.
 */
export function useAutomationOptions(
  workspaceId: string,
  projectId: string | null,
): AutomationOptions {
  const { data: columns = [] } = useGetColumns(projectId ?? "");
  const { data: users } = useGetActiveWorkspaceUsers(workspaceId);
  const { data: teams = [] } = useGetTeams({ workspaceId });
  const { data: labels = [] } = useGetLabelsByWorkspace(workspaceId);
  const { data: projectFields = [] } = useGetFieldDefinitions(projectId ?? "");
  const { data: workspaceFields = [] } = useGetWorkspaceFieldDefinitions(
    projectId ? "" : workspaceId,
  );

  return useMemo(() => {
    const fields = (
      (projectId ? projectFields : workspaceFields) as FieldDefinition[]
    ).filter((field) => field.type !== "relation");
    return {
      columns: (columns as Array<{ id: string; name: string }>).map(
        ({ id, name }) => ({ id, name }),
      ),
      members: (users?.members ?? []).map((member) => ({
        id: member.userId,
        name: member.user?.name ?? "",
      })),
      teams: (teams as Array<{ id: string; name: string }>).map(
        ({ id, name }) => ({ id, name }),
      ),
      labels: (
        labels as Array<{ id: string; name: string; taskId: string | null }>
      )
        .filter((label) => !label.taskId)
        .map(({ id, name }) => ({ id, name })),
      fields,
    };
  }, [
    columns,
    users,
    teams,
    labels,
    projectFields,
    workspaceFields,
    projectId,
  ]);
}
