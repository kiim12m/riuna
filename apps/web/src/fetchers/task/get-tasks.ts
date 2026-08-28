import { client } from "@riuna/libs";
import { HttpError } from "@/lib/http-error";
import type { TaskFilter } from "@/types/task-filter";

async function getTasks(projectId: string, filter?: TaskFilter | null) {
  const response = await client.task.tasks[":projectId"].$get({
    param: { projectId },
    // El filtro viaja como JSON en la cadena de consulta. El servidor lo
    // valida y responde 400 si no encaja, asi que aqui no se comprueba nada:
    // duplicar la validacion solo sirve para que las dos se desincronicen.
    query: filter ? { filter: JSON.stringify(filter) } : {},
  });

  if (!response.ok) {
    throw new HttpError(await response.text(), response.status);
  }

  const json = await response.json();

  return json.data;
}

export default getTasks;
