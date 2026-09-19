import { client } from "@riuna/libs";

async function getProjectFieldDefinitions(projectId: string) {
  const response = await client.field.project[":projectId"].$get({
    param: { projectId },
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}

export default getProjectFieldDefinitions;
