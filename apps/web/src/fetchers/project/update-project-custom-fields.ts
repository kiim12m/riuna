import { client } from "@riuna/libs";
import { HttpError } from "@/lib/http-error";

/** Los valores de los campos de proyecto (ADR 088): parcial, vacio borra. */
async function updateProjectCustomFields(
  projectId: string,
  values: Record<string, unknown>,
) {
  const response = await client.project[":id"]["custom-fields"].$put({
    param: { id: projectId },
    json: { values },
  });

  if (!response.ok) {
    throw new HttpError(await response.text(), response.status);
  }

  return response.json();
}

export default updateProjectCustomFields;
