import { client } from "@riuna/libs";
import type { InferRequestType } from "hono/client";

export type CreateTimeEntryRequest = InferRequestType<
  (typeof client)["time-entry"]["$post"]
>["json"];

/**
 * Con `endTime`, un registro manual ya cerrado -"ayer dediqué una hora"-; sin
 * el, la entrada nace en marcha y cierra la que hubiera (ADR 044).
 */
async function createTimeEntry({
  taskId,
  description,
  startTime,
  endTime,
}: CreateTimeEntryRequest) {
  const response = await client["time-entry"].$post({
    json: {
      taskId,
      description,
      startTime,
      endTime,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  const data = await response.json();
  return data;
}

export default createTimeEntry;
