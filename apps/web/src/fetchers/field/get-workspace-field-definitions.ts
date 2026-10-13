import { client } from "@riuna/libs";

/**
 * Los campos personalizados del espacio entero. Cada uno lleva `filterable`:
 * si una vista que cruza proyectos puede filtrar por el (el servidor retira los
 * que algun proyecto redefine con otra forma de comparacion).
 */
async function getWorkspaceFieldDefinitions(
  workspaceId: string,
  includeArchived = false,
  // Los de proyecto (ADR 088) son otra lista: no se ponen a las tareas.
  entity: "task" | "project" = "task",
) {
  const response = await client.field.workspace[":workspaceId"].$get({
    param: { workspaceId },
    query: {
      ...(includeArchived ? { includeArchived: "true" } : {}),
      ...(entity === "project" ? { entity } : {}),
    },
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}

export default getWorkspaceFieldDefinitions;
