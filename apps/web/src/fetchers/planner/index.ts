import { client } from "@riuna/libs";
import { HttpError } from "@/lib/http-error";

export async function getPlan(workspaceId: string, days = 15) {
  const response = await client.planner.$get({
    query: { workspaceId, days: String(days) },
  });

  if (!response.ok) {
    throw new HttpError(await response.text(), response.status);
  }

  return response.json();
}

export async function setPlanEntry(
  workspaceId: string,
  taskId: string,
  input: {
    plannedDate: string;
    position?: number;
    /** Ausente: no se toca. Presente: ancla o libera (ADR 041). */
    startMinute?: number | null;
  },
) {
  const response = await client.planner[":taskId"].$put({
    param: { taskId },
    query: { workspaceId },
    json: input,
  });

  if (!response.ok) {
    throw new HttpError(await response.text(), response.status);
  }

  return response.json();
}

export async function removePlanEntry(workspaceId: string, taskId: string) {
  const response = await client.planner[":taskId"].$delete({
    param: { taskId },
    query: { workspaceId },
  });

  if (!response.ok) {
    throw new HttpError(await response.text(), response.status);
  }

  return response.json();
}

export type PlanResponse = Awaited<ReturnType<typeof getPlan>>;
export type PlanTask = PlanResponse["unplanned"][number];
export type PlanEntry = PlanResponse["entries"][number];
export type PlanGhost = PlanResponse["ghosts"][number];
