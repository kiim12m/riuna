import { client } from "@riuna/libs";

/**
 * Mueve una tarea y su rama para que empiece `startDate`; la API cuenta los
 * dias laborables (ADR 083).
 */
async function shiftTaskBranch(taskId: string, startDate: string) {
  const response = await client.task["shift-branch"][":id"].$post({
    param: { id: taskId },
    json: { startDate },
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

export default shiftTaskBranch;
