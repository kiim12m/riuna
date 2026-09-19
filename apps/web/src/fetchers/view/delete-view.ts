import { client } from "@riuna/libs";

async function deleteView(viewId: string) {
  const response = await client.view[":id"].$delete({ param: { id: viewId } });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}

export default deleteView;
