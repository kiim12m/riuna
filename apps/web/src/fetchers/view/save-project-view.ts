import { client } from "@riuna/libs";

type SaveViewPayload = Parameters<
  (typeof client)["view"]["project"][":projectId"]["$post"]
>[0]["json"];

async function saveProjectView(projectId: string, view: SaveViewPayload) {
  const response = await client.view.project[":projectId"].$post({
    param: { projectId },
    json: view,
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}

export default saveProjectView;
export type { SaveViewPayload };
