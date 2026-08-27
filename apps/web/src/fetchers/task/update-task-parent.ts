import { client } from "@riuna/libs";

async function updateTaskParent(taskId: string, parentId: string | null) {
  const response = await client.task.parent[":id"].$put({
    param: { id: taskId },
    json: { parentId },
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}

export default updateTaskParent;
