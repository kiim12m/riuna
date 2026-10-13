import { client } from "@riuna/libs";
import { HttpError } from "@/lib/http-error";

/** Hace del proyecto un subproyecto de otro, o lo suelta (ADR 089). */
async function updateProjectParent(projectId: string, parentId: string | null) {
  const response = await client.project[":id"].parent.$patch({
    param: { id: projectId },
    json: { parentId },
  });

  if (!response.ok) {
    throw new HttpError(await response.text(), response.status);
  }

  return response.json();
}

export default updateProjectParent;
