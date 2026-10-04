import { client } from "@riuna/libs";

/**
 * Los campos que aplican a un proyecto: los suyos y los del espacio. Con
 * `includeArchived` tambien los archivados, que el editor necesita para poder
 * restaurarlos; los formularios y las vistas no los quieren.
 */
async function getProjectFieldDefinitions(
  projectId: string,
  includeArchived = false,
) {
  const response = await client.field.project[":projectId"].$get({
    param: { projectId },
    query: includeArchived ? { includeArchived: "true" } : {},
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}

export default getProjectFieldDefinitions;
