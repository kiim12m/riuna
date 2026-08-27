import { client } from "@riuna/libs";

async function updateTaskEstimate(taskId: string, estimate: number | null) {
  const response = await client.task.estimate[":id"].$put({
    param: { id: taskId },
    json: { estimate },
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}

export default updateTaskEstimate;
