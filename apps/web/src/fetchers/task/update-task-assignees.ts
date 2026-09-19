import { client } from "@riuna/libs";

async function updateTaskAssignees(taskId: string, userIds: string[]) {
  const response = await client.task.assignees[":id"].$put({
    param: { id: taskId },
    json: { userIds },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  return await response.json();
}

export default updateTaskAssignees;
