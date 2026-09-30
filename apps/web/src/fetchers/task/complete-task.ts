import { client } from "@riuna/libs";

/** La casilla de "hecha" de Hoy y el Planificador (ADR 046). */
async function completeTask(taskId: string, done: boolean) {
  const response = await client.task.complete[":id"].$post({
    param: { id: taskId },
    json: { done },
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}

export default completeTask;
