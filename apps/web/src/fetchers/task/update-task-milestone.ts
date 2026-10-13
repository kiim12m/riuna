import { client } from "@riuna/libs";

/** Marca o desmarca una tarea como hito (ADR 082). */
async function updateTaskMilestone(taskId: string, isMilestone: boolean) {
  const response = await client.task.milestone[":id"].$put({
    param: { id: taskId },
    json: { isMilestone },
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}

export default updateTaskMilestone;
