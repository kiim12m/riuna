import { client } from "@riuna/libs";

type CreateFieldPayload = Parameters<
  (typeof client)["field"]["workspace"][":workspaceId"]["$post"]
>[0]["json"];

async function createWorkspaceFieldDefinition(
  workspaceId: string,
  field: CreateFieldPayload,
) {
  const response = await client.field.workspace[":workspaceId"].$post({
    param: { workspaceId },
    json: field,
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}

export default createWorkspaceFieldDefinition;
