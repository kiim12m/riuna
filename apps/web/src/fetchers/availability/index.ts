import { client } from "@riuna/libs";
import { HttpError } from "@/lib/http-error";

/** Las ausencias de quien mira, con su nota: solo salen aqui (ADR 060). */
export async function listTimeOff(workspaceId: string) {
  const response = await client.availability["time-off"].$get({
    query: { workspaceId },
  });

  if (!response.ok) {
    throw new HttpError(await response.text(), response.status);
  }

  return response.json();
}

export type TimeOff = Awaited<ReturnType<typeof listTimeOff>>[number];

export async function createTimeOff(
  workspaceId: string,
  input: { startsOn: string; endsOn: string; note: string | null },
) {
  const response = await client.availability["time-off"].$post({
    query: { workspaceId },
    json: input,
  });

  if (!response.ok) {
    throw new HttpError(await response.text(), response.status);
  }

  return response.json();
}

export async function deleteTimeOff(workspaceId: string, id: string) {
  const response = await client.availability["time-off"][":id"].$delete({
    param: { id },
    query: { workspaceId },
  });

  if (!response.ok) {
    throw new HttpError(await response.text(), response.status);
  }

  return response.json();
}

/** Los festivos del espacio: los lee cualquier miembro. */
export async function listHolidays(workspaceId: string) {
  const response = await client.availability.holidays.$get({
    query: { workspaceId },
  });

  if (!response.ok) {
    throw new HttpError(await response.text(), response.status);
  }

  return response.json();
}

export type Holiday = Awaited<ReturnType<typeof listHolidays>>[number];

export async function createHoliday(
  workspaceId: string,
  input: { day: string; name: string },
) {
  const response = await client.availability.holidays.$post({
    query: { workspaceId },
    json: input,
  });

  if (!response.ok) {
    throw new HttpError(await response.text(), response.status);
  }

  return response.json();
}

export async function deleteHoliday(workspaceId: string, id: string) {
  const response = await client.availability.holidays[":id"].$delete({
    param: { id },
    query: { workspaceId },
  });

  if (!response.ok) {
    throw new HttpError(await response.text(), response.status);
  }

  return response.json();
}
