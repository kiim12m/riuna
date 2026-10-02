import { client } from "@riuna/libs";
import { HttpError } from "@/lib/http-error";

/** `focusMode`: una sesion de trabajo del modo foco (ADR 056). */
async function startTimer(
  taskId: string,
  focusMode?: "pomodoro" | "flowtime" | "countdown",
) {
  const response = await client["time-entry"].start.$post({
    json: { taskId, ...(focusMode ? { focusMode } : {}) },
  });

  if (!response.ok) {
    throw new HttpError(await response.text(), response.status);
  }

  return response.json();
}

export default startTimer;
