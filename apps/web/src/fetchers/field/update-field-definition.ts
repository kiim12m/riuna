import { client } from "@riuna/libs";

type UpdateFieldPayload = Parameters<
  (typeof client)["field"][":id"]["$patch"]
>[0]["json"];

/**
 * Cambia un campo: nombre, descripcion, obligatoriedad, posicion o archivado.
 * Ni su tipo ni su clave cambian nunca (ADR 013): la clave es con la que cada
 * tarea guarda su valor.
 */
async function updateFieldDefinition(id: string, patch: UpdateFieldPayload) {
  const response = await client.field[":id"].$patch({
    param: { id },
    json: patch,
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}

export default updateFieldDefinition;
