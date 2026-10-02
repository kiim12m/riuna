import { client } from "@riuna/libs";
import { HttpError } from "@/lib/http-error";

/** El cierre de un dia de quien mira, con su valoracion privada (ADR 054). */
export async function getDayReview(workspaceId: string, date: string) {
  const response = await client.review.day[":date"].$get({
    param: { date },
    query: { workspaceId },
  });

  if (!response.ok) {
    throw new HttpError(await response.text(), response.status);
  }

  return response.json();
}

export type DayReviewResponse = Awaited<ReturnType<typeof getDayReview>>;

export type CloseDayInput = {
  /** `plannedDate: null` saca la tarea del plan. */
  decisions: { taskId: string; plannedDate: string | null }[];
  blockers: string | null;
  impact: number | null;
  energy: number | null;
  note: string | null;
};

/** Cierra el dia: cada pendiente necesita su decision, o responde 400. */
export async function closeDay(
  workspaceId: string,
  date: string,
  input: CloseDayInput,
) {
  const response = await client.review.day[":date"].$put({
    param: { date },
    query: { workspaceId },
    json: input,
  });

  if (!response.ok) {
    throw new HttpError(await response.text(), response.status);
  }

  return response.json();
}
