import { client } from "@riuna/libs";

/** Fechas propias o automaticas (ADR 083). */
async function updateTaskAutoDates(taskId: string, autoDates: boolean) {
  const response = await client.task["auto-dates"][":id"].$put({
    param: { id: taskId },
    json: { autoDates },
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

export default updateTaskAutoDates;
