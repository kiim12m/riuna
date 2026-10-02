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

/** La revision de la semana que empieza en `start`, con sus cifras al dia. */
export async function getWeekReview(workspaceId: string, start: string) {
  const response = await client.review.week[":start"].$get({
    param: { start },
    query: { workspaceId },
  });

  if (!response.ok) {
    throw new HttpError(await response.text(), response.status);
  }

  return response.json();
}

export type WeekReviewResponse = Awaited<ReturnType<typeof getWeekReview>>;

export type CloseWeekInput = Omit<CloseDayInput, "decisions">;

/** Guarda la revision semanal: bloqueos y cifras, la valoracion aparte. */
export async function closeWeek(
  workspaceId: string,
  start: string,
  input: CloseWeekInput,
) {
  const response = await client.review.week[":start"].$put({
    param: { start },
    query: { workspaceId },
    json: input,
  });

  if (!response.ok) {
    throw new HttpError(await response.text(), response.status);
  }

  return response.json();
}

/** El stand-up de quien mira: derivado, nunca guardado ni con la valoracion. */
export async function getStandup(workspaceId: string) {
  const response = await client.review.standup.$get({
    query: { workspaceId },
  });

  if (!response.ok) {
    throw new HttpError(await response.text(), response.status);
  }

  return response.json();
}

export type StandupResponse = Awaited<ReturnType<typeof getStandup>>;
