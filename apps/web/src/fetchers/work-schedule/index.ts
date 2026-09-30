import { client } from "@riuna/libs";
import { HttpError } from "@/lib/http-error";

export async function getWorkSchedule() {
  const response = await client["work-schedule"].$get();

  if (!response.ok) {
    throw new HttpError(await response.text(), response.status);
  }

  return response.json();
}

export type WorkScheduleResponse = Awaited<ReturnType<typeof getWorkSchedule>>;

export async function updateWorkSchedule(input: WorkScheduleResponse) {
  const response = await client["work-schedule"].$put({ json: input });

  if (!response.ok) {
    throw new HttpError(await response.text(), response.status);
  }

  return response.json();
}
