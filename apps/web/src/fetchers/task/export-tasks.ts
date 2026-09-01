import { client } from "@riuna/libs";

async function exportTasks(projectId: string) {
  const response = await client.task.export[":projectId"].$get({
    param: { projectId },
    // El validador de query hace obligatorio el objeto aunque todos sus campos
    // sean opcionales. Sin `format`, la ruta sigue devolviendo JSON.
    query: {},
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  const data = await response.json();
  return data;
}

export default exportTasks;
