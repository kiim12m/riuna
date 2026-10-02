import { client } from "@riuna/libs";
import { getApiUrl } from "@/fetchers/get-api-url";
import { HttpError } from "@/lib/http-error";

/** Si hay enlace del calendario en el espacio; nunca el token (ADR 057). */
export async function getCalendarFeed(workspaceId: string) {
  const response = await client.calendar.feed.$get({ query: { workspaceId } });

  if (!response.ok) {
    throw new HttpError(await response.text(), response.status);
  }

  return response.json();
}

export type CalendarFeedResponse = Awaited<ReturnType<typeof getCalendarFeed>>;

/** Crea el enlace o lo regenera. El token solo llega aqui. */
export async function createCalendarFeed(workspaceId: string) {
  const response = await client.calendar.feed.$post({ query: { workspaceId } });

  if (!response.ok) {
    throw new HttpError(await response.text(), response.status);
  }

  return response.json();
}

export async function deleteCalendarFeed(workspaceId: string) {
  const response = await client.calendar.feed.$delete({
    query: { workspaceId },
  });

  if (!response.ok) {
    throw new HttpError(await response.text(), response.status);
  }

  return response.json();
}

/**
 * La URL absoluta del feed: `VITE_API_URL` puede ser relativa, y un
 * calendario externo necesita la direccion entera.
 */
export function calendarFeedUrl(token: string) {
  return new URL(getApiUrl(`calendar/${token}.ics`), window.location.origin)
    .href;
}
