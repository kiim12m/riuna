import { client } from "@riuna/libs";
import { HttpError } from "@/lib/http-error";

/** La Bandeja de quien mira, o `null` si aun no la ha usado (ADR 051). */
export async function getInbox(workspaceId: string) {
  const response = await client.capture.inbox.$get({ query: { workspaceId } });

  if (!response.ok) {
    throw new HttpError(await response.text(), response.status);
  }

  return (await response.json()).inbox;
}

/** La Bandeja de quien mira, creada si es la primera vez. Idempotente. */
export async function ensureInbox(workspaceId: string) {
  const response = await client.capture.inbox.$post({ json: { workspaceId } });

  if (!response.ok) {
    throw new HttpError(await response.text(), response.status);
  }

  const { inbox } = await response.json();
  if (!inbox) throw new HttpError("Inbox not created", 500);
  return inbox;
}
