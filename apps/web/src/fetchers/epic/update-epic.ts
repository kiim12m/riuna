import { client } from "@riuna/libs";

type UpdateEpicPayload = {
  name?: string;
  description?: string | null;
  color?: string | null;
  startDate?: string | null;
  dueDate?: string | null;
  archived?: boolean;
};

async function updateEpic(epicId: string, epic: UpdateEpicPayload) {
  const response = await client.epic[":id"].$patch({
    param: { id: epicId },
    json: epic,
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}

export default updateEpic;
