import { client } from "@kaneo/libs";
import type Task from "@/types/task";

type UpdateTaskTeamPayload = Pick<Task, "teamId">;

async function updateTaskTeam(taskId: string, task: UpdateTaskTeamPayload) {
  const response = await client.task.team[":id"].$put({
    param: { id: taskId },
    json: {
      teamId: task.teamId || "",
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  const data = await response.json();

  return data;
}

export default updateTaskTeam;
