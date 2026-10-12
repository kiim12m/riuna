import { client } from "@riuna/libs";

// Observadores de tarea (ADR 076). Sin `userId`, la API entiende «yo».

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

export async function getTaskWatchers(taskId: string) {
  return readOrThrow(
    await client["task-watcher"][":taskId"].$get({ param: { taskId } }),
  );
}

export async function watchTask({
  taskId,
  userId,
}: {
  taskId: string;
  userId?: string;
}) {
  return readOrThrow(
    await client["task-watcher"][":taskId"].$post({
      param: { taskId },
      json: userId ? { userId } : {},
    }),
  );
}

export async function unwatchTask({
  taskId,
  userId,
}: {
  taskId: string;
  userId?: string;
}) {
  return readOrThrow(
    await client["task-watcher"][":taskId"].$delete({
      param: { taskId },
      query: userId ? { userId } : {},
    }),
  );
}

export type TaskWatcher = Awaited<ReturnType<typeof getTaskWatchers>>[number];
