import { client } from "@riuna/libs";

async function deleteEpic(epicId: string) {
  const response = await client.epic[":id"].$delete({
    param: { id: epicId },
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}

export default deleteEpic;
