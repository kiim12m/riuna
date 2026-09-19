import { client } from "@riuna/libs";
import { HttpError } from "@/lib/http-error";

async function unwrap<T>(response: {
  ok: boolean;
  status: number;
  text: () => Promise<string>;
  json: () => Promise<T>;
}) {
  if (!response.ok) {
    throw new HttpError(await response.text(), response.status);
  }
  return response.json();
}

export type Cadence = {
  frequency: "daily" | "weekly" | "monthly";
  interval: number;
  byWeekday?: number[];
  byMonthDay?: number;
};

export type RecurrenceTemplate = {
  title: string;
  description?: string;
  priority?: string;
  estimate?: number | null;
};

export async function getRecurrences(projectId: string) {
  return unwrap(
    await client.recurrence.project[":projectId"].$get({
      param: { projectId },
    }),
  );
}

export async function createRecurrence(
  projectId: string,
  payload: {
    template: RecurrenceTemplate;
    cadence: Cadence;
    startsAt: string;
    endsAt?: string | null;
  },
) {
  return unwrap(
    await client.recurrence.project[":projectId"].$post({
      param: { projectId },
      json: payload,
    }),
  );
}

export async function updateRecurrence(
  id: string,
  payload: {
    template?: RecurrenceTemplate;
    cadence?: Cadence;
    endsAt?: string | null;
    active?: boolean;
  },
) {
  return unwrap(
    await client.recurrence[":id"].$patch({ param: { id }, json: payload }),
  );
}

export async function deleteRecurrence(id: string) {
  return unwrap(await client.recurrence[":id"].$delete({ param: { id } }));
}

export type Recurrence = Awaited<ReturnType<typeof getRecurrences>>[number];
