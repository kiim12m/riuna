import { client } from "@riuna/libs";
import { HttpError } from "@/lib/http-error";

async function getRunningTimeEntry(workspaceId: string) {
  const response = await client["time-entry"].running.$get({
    query: { workspaceId },
  });

  if (!response.ok) {
    throw new HttpError(await response.text(), response.status);
  }

  return response.json();
}

export default getRunningTimeEntry;

export type RunningTimeEntryResponse = Awaited<
  ReturnType<typeof getRunningTimeEntry>
>;
export type RunningTimeEntry = NonNullable<RunningTimeEntryResponse["running"]>;
export type LastTimeEntry = NonNullable<RunningTimeEntryResponse["last"]>;
