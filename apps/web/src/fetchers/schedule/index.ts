import { client } from "@riuna/libs";
import { HttpError } from "@/lib/http-error";

export async function getSchedule(
  workspaceId: string,
  days = 7,
  from?: string,
) {
  const response = await client.schedule.$get({
    query: {
      workspaceId,
      days: String(days),
      ...(from ? { from } : {}),
    },
  });

  if (!response.ok) {
    throw new HttpError(await response.text(), response.status);
  }

  return response.json();
}

export async function setEntryTime(
  workspaceId: string,
  taskId: string,
  startMinute: number | null,
) {
  const response = await client.schedule.entries[":taskId"].$put({
    param: { taskId },
    query: { workspaceId },
    json: { startMinute },
  });

  if (!response.ok) {
    throw new HttpError(await response.text(), response.status);
  }

  return response.json();
}

export type CreateBlockInput = {
  title: string;
  kind: "fixed" | "break";
  startMinute: number;
  endMinute: number;
  plannedDate?: string;
  cadence?: Record<string, unknown>;
  /** Solo junto a `cadence`: hasta cuando se proyecta la serie. */
  endsAt?: string;
};

export type UpdateBlockInput = {
  title: string;
  kind: "fixed" | "break";
  startMinute: number;
  endMinute: number;
  /** Solo si el bloque es suelto: a que dia se mueve. */
  plannedDate?: string;
  /** Solo si repite: hasta cuando. `null` quita el limite. */
  endsAt?: string | null;
};

export async function createBlock(
  workspaceId: string,
  input: CreateBlockInput,
) {
  const response = await client.schedule.blocks.$post({
    query: { workspaceId },
    json: input,
  });

  if (!response.ok) {
    throw new HttpError(await response.text(), response.status);
  }

  return response.json();
}

export async function updateBlock(
  workspaceId: string,
  id: string,
  input: UpdateBlockInput,
) {
  const response = await client.schedule.blocks[":id"].$patch({
    param: { id },
    query: { workspaceId },
    json: input,
  });

  if (!response.ok) {
    throw new HttpError(await response.text(), response.status);
  }

  return response.json();
}

export async function deleteBlock(workspaceId: string, id: string) {
  const response = await client.schedule.blocks[":id"].$delete({
    param: { id },
    query: { workspaceId },
  });

  if (!response.ok) {
    throw new HttpError(await response.text(), response.status);
  }

  return response.json();
}

export type ScheduleResponse = Awaited<ReturnType<typeof getSchedule>>;
export type ScheduleDay = ScheduleResponse["days"][number];
export type ScheduleSegment = ScheduleDay["segments"][number];
