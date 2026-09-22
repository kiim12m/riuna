import { client } from "@riuna/libs";
import type { ViewType } from "./get-project-views";

async function getWorkspaceViews(workspaceId: string, type?: ViewType) {
  const response = await client.view.workspace.$get({
    query: { workspaceId, ...(type ? { type } : {}) },
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}

export default getWorkspaceViews;
