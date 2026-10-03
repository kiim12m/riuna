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
/** Una entrada del plan: «De dias anteriores» o «Plan de hoy». */
export type TodayEntry = TodayResponse["previous"][number];
/** Las de hoy llevan ademas el instante de su hora anclada (ADR 055). */
export type TodayPlanned = TodayResponse["planned"][number];
export type TodayUrgent = TodayResponse["urgent"][number];
export type TodayTask = TodayResponse["done"][number];
