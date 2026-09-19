import { client } from "@riuna/libs";

// El tipo lo fija el cliente tipado a partir del validador de la API: es la
// misma lista que vigila el CHECK de `field_definition`.
type CreateFieldPayload = Parameters<
  (typeof client)["field"]["project"][":projectId"]["$post"]
>[0]["json"];

async function createProjectFieldDefinition(
  projectId: string,
  field: CreateFieldPayload,
) {
  const response = await client.field.project[":projectId"].$post({
    param: { projectId },
    json: field,
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}

export default createProjectFieldDefinition;
