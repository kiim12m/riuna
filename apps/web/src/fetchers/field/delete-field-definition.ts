import { client } from "@riuna/libs";

/** Borra el campo **y los valores** que las tareas guardaban para el. */
async function deleteFieldDefinition(id: string) {
  const response = await client.field[":id"].$delete({ param: { id } });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}

export default deleteFieldDefinition;
