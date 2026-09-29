import { client } from "@riuna/libs";
import { HttpError } from "@/lib/http-error";

async function startTimer(taskId: string) {
  const response = await client["time-entry"].start.$post({
    json: { taskId },
  });

  if (!response.ok) {
    throw new HttpError(await response.text(), response.status);
  }

  return response.json();
}

export default startTimer;
