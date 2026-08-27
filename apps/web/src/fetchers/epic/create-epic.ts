import { client } from "@riuna/libs";

type CreateEpicPayload = {
  name: string;
  description?: string | null;
  color?: string | null;
  startDate?: string | null;
  dueDate?: string | null;
};

async function createEpic(projectId: string, epic: CreateEpicPayload) {
  const response = await client.epic.project[":projectId"].$post({
    param: { projectId },
    json: epic,
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}

export default createEpic;
