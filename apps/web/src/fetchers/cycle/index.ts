import { client } from "@riuna/libs";
import { HttpError } from "@/lib/http-error";

async function unwrap<T>(response: {
  ok: boolean;
  status: number;
  text: () => Promise<string>;
  json: () => Promise<T>;
}) {
  if (!response.ok) {
    throw new HttpError(await response.text(), response.status);
  }
  return response.json();
}

export async function getCycles(projectId: string, includeClosed = true) {
  return unwrap(
    await client.cycle.project[":projectId"].$get({
      param: { projectId },
      query: includeClosed ? {} : { includeClosed: "false" },
    }),
  );
}

export async function getVelocityHistory(projectId: string) {
  return unwrap(
    await client.cycle.project[":projectId"].velocity.$get({
      param: { projectId },
    }),
  );
}

export async function getCycleReport(cycleId: string) {
  return unwrap(
    await client.cycle[":id"].report.$get({ param: { id: cycleId } }),
  );
}

export type CreateCyclePayload = {
  name: string;
  goal?: string | null;
  startDate: string;
  endDate: string;
};

export async function createCycle(
  projectId: string,
  payload: CreateCyclePayload,
) {
  return unwrap(
    await client.cycle.project[":projectId"].$post({
      param: { projectId },
      json: payload,
    }),
  );
}

export type UpdateCyclePayload = {
  name?: string;
  goal?: string | null;
  startDate?: string;
  endDate?: string;
  status?: "planned" | "active";
};

export async function updateCycle(
  cycleId: string,
  payload: UpdateCyclePayload,
) {
  return unwrap(
    await client.cycle[":id"].$patch({ param: { id: cycleId }, json: payload }),
  );
}

export async function closeCycle(
  cycleId: string,
  payload: { unfinished: "backlog" | "cycle"; targetCycleId?: string },
) {
  return unwrap(
    await client.cycle[":id"].close.$post({
      param: { id: cycleId },
      json: payload,
    }),
  );
}

export async function deleteCycle(cycleId: string) {
  return unwrap(await client.cycle[":id"].$delete({ param: { id: cycleId } }));
}

export async function updateTaskCycle(taskId: string, cycleId: string | null) {
  return unwrap(
    await client.cycle.task[":taskId"].$put({
      param: { taskId },
      json: { cycleId },
    }),
  );
}

export type Cycle = Awaited<ReturnType<typeof getCycles>>[number];
export type CycleReport = Awaited<ReturnType<typeof getCycleReport>>;
export type VelocityPoint = Awaited<
  ReturnType<typeof getVelocityHistory>
>[number];
