import { client } from "@riuna/libs";
import type { InferRequestType } from "hono/client";

export type CreateTaskRequest = InferRequestType<
  (typeof client)["task"][":projectId"]["$post"]
>["json"] &
  InferRequestType<(typeof client)["task"][":projectId"]["$post"]>["param"];

async function createTask(
  title: string,
  description: string,
  projectId: string,
  userId: string | undefined,
  status: string,
  startDate: Date | undefined,
  dueDate: Date | undefined,
  priority: CreateTaskRequest["priority"],
  // Ultimo y opcional a proposito: los ocho sitios que ya crean tareas sueltas
  // no tienen que saber nada del arbol.
  options?: { parentId?: string | null; estimate?: number },
) {
  if (!projectId) {
    throw new Error("No project selected for task creation");
  }

  const response = await client.task[":projectId"].$post({
    json: {
      title,
      description,
      ...(userId ? { userId } : {}),
      status,
      startDate: startDate?.toISOString() || undefined,
      dueDate: dueDate?.toISOString() || undefined,
      priority,
      ...(options?.parentId ? { parentId: options.parentId } : {}),
      ...(options?.estimate !== undefined
        ? { estimate: options.estimate }
        : {}),
    },
    param: { projectId },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  const data = await response.json();

  return data;
}

export default createTask;
