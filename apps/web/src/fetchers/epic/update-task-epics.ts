import { client } from "@riuna/libs";

async function updateTaskEpics(taskId: string, epicIds: string[]) {
  const response = await client.epic.task[":taskId"].$put({
    param: { taskId },
    json: { epicIds },
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}

export default updateTaskEpics;
