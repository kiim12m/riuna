import { client } from "@riuna/libs";

// Recordatorio personal en una tarea (ADR 077): siempre el de quien pregunta.

async function readOrThrow<T>(response: {
  ok: boolean;
  text: () => Promise<string>;
  json: () => Promise<T>;
}) {
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json();
}

export async function getTaskReminder(taskId: string) {
  const { reminder } = await readOrThrow(
    await client["task-reminder"][":taskId"].$get({ param: { taskId } }),
  );
  return reminder;
}

export async function setTaskReminder({
  taskId,
  remindAt,
  note,
}: {
  taskId: string;
  remindAt: string;
  note?: string | null;
}) {
  const { reminder } = await readOrThrow(
    await client["task-reminder"][":taskId"].$put({
      param: { taskId },
      json: { remindAt, note },
    }),
  );
  return reminder;
}

export async function clearTaskReminder(taskId: string) {
  await readOrThrow(
    await client["task-reminder"][":taskId"].$delete({ param: { taskId } }),
  );
  return null;
}

export type TaskReminder = NonNullable<
  Awaited<ReturnType<typeof getTaskReminder>>
>;
