import { client } from "@riuna/libs";
import { HttpError } from "@/lib/http-error";

export async function getToday(workspaceId: string) {
  const response = await client.today.$get({ query: { workspaceId } });

  if (!response.ok) {
    throw new HttpError(await response.text(), response.status);
  }

  return response.json();
}

export type TodayResponse = Awaited<ReturnType<typeof getToday>>;
export type TodayEntry = TodayResponse["planned"][number];
export type TodayUrgent = TodayResponse["urgent"][number];
export type TodayTask = TodayResponse["done"][number];
