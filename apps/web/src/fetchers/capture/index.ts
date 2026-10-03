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

export type CaptureTaskInput = {
  workspaceId: string;
  title: string;
  projectId?: string;
  priority?: "no-priority" | "low" | "medium" | "high" | "urgent";
  estimate?: number;
  dueDate?: string;
  plannedDate?: string;
  startMinute?: number;
  labelIds?: string[];
};

/** Captura rapida (ADR 052): la tarea, asignada a quien la crea. */
export async function captureTask(input: CaptureTaskInput) {
  const response = await client.capture.$post({ json: input });

  if (!response.ok) {
    throw new HttpError(await response.text(), response.status);
  }

  return response.json();
}
