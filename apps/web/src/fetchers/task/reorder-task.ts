import { client } from "@riuna/libs";

export type TaskPlacement = {
  status: string;
  afterId: string | null;
  beforeId: string | null;
};

async function reorderTask(taskId: string, placement: TaskPlacement) {
  const response = await client.task.reorder[":id"].$put({
    param: { id: taskId },
    json: placement,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  return response.json();
}

export default reorderTask;
