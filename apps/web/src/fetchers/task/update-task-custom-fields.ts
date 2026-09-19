import { client } from "@riuna/libs";

async function updateTaskCustomFields(
  taskId: string,
  values: Record<string, unknown>,
) {
  const response = await client.task["custom-fields"][":id"].$put({
    param: { id: taskId },
    json: { values },
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}

export default updateTaskCustomFields;
