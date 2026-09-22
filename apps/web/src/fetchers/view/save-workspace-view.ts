import { client } from "@riuna/libs";
import type { SaveViewPayload } from "./save-project-view";

async function saveWorkspaceView(workspaceId: string, view: SaveViewPayload) {
  const response = await client.view.workspace.$post({
    query: { workspaceId },
    json: view,
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}

export default saveWorkspaceView;
