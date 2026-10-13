import { client } from "@riuna/libs";
import { HttpError } from "@/lib/http-error";
import type { TaskFilter } from "@/types/task-filter";

export type TaskQueryOptions = {
  /** Que hace el filtro con la jerarquia. Ver `GetTasksOptions` en la API. */
  treeScope?: "matching" | "roots" | "withDescendants";
  /** Con las tareas de los subproyectos (ADR 089). */
  includeSubprojects?: boolean;
};

async function getTasks(
  projectId: string,
  filter?: TaskFilter | null,
  options?: TaskQueryOptions,
) {
  const response = await client.task.tasks[":projectId"].$get({
    param: { projectId },
    // El filtro viaja como JSON en la cadena de consulta. El servidor lo
    // valida y responde 400 si no encaja, asi que aqui no se comprueba nada:
    // duplicar la validacion solo sirve para que las dos se desincronicen.
    query: {
      ...(filter ? { filter: JSON.stringify(filter) } : {}),
      ...(options?.treeScope && options.treeScope !== "matching"
        ? { treeScope: options.treeScope }
        : {}),
      ...(options?.includeSubprojects ? { includeSubprojects: "true" } : {}),
    },
  });

  if (!response.ok) {
    throw new HttpError(await response.text(), response.status);
  }

  const json = await response.json();

  return json.data;
}

export default getTasks;
