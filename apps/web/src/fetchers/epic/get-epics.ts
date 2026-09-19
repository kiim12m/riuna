import { client } from "@riuna/libs";

async function getEpics(projectId: string) {
  const response = await client.epic.project[":projectId"].$get({
    param: { projectId },
    query: {},
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}

export default getEpics;
