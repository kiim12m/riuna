import { client } from "@riuna/libs";

/** El desfase de una precedencia, en dias laborables (ADR 084). */
async function updateTaskRelationLag(id: string, lag: number) {
  const response = await client["task-relation"][":id"].lag.$patch({
    param: { id },
    json: { lag },
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

export default updateTaskRelationLag;
