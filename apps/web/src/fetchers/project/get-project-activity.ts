import { client } from "@riuna/libs";
import { HttpError } from "@/lib/http-error";

/** La historia del estado de un proyecto (ADR 087). */
async function getProjectActivity(projectId: string) {
  const response = await client.project[":id"].activity.$get({
    param: { id: projectId },
  });

  if (!response.ok) {
    throw new HttpError(await response.text(), response.status);
  }

  return response.json();
}

export type ProjectActivityEntry = Awaited<
  ReturnType<typeof getProjectActivity>
>[number];

export default getProjectActivity;
