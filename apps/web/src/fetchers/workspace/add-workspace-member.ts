import { client } from "@riuna/libs";
import type { InferRequestType } from "hono/client";

export type AddWorkspaceMemberRequest = InferRequestType<
  (typeof client)["workspace"][":workspaceId"]["member"]["$post"]
>["json"] & { workspaceId: string };

async function addWorkspaceMember({
  workspaceId,
  email,
  role,
}: AddWorkspaceMemberRequest) {
  const response = await client.workspace[":workspaceId"].member.$post({
    param: { workspaceId },
    json: { email, role },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  return await response.json();
}

export default addWorkspaceMember;
