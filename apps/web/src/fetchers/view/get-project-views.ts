import { client } from "@riuna/libs";

type ViewType = NonNullable<
  Parameters<
    (typeof client)["view"]["project"][":projectId"]["$get"]
  >[0]["query"]
>["type"];

async function getProjectViews(projectId: string, type?: ViewType) {
  const response = await client.view.project[":projectId"].$get({
    param: { projectId },
    query: type ? { type } : {},
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}

export default getProjectViews;
export type { ViewType };
