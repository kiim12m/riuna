import { client } from "@riuna/libs";
import { HttpError } from "@/lib/http-error";
import type { ProjectHealth } from "@/lib/project-health";

export type ProjectStatusInput = {
  health?: ProjectHealth;
  note?: string | null;
  /** Un instante ISO, o nulo para quitarla. */
  startDate?: string | null;
  endDate?: string | null;
  leadUserId?: string | null;
  notify?: boolean;
};

/** El estado de un proyecto (ADR 087): solo cambia lo que se manda. */
async function updateProjectStatus(
  projectId: string,
  input: ProjectStatusInput,
) {
  const response = await client.project[":id"].status.$patch({
    param: { id: projectId },
    json: input,
  });

  if (!response.ok) {
    throw new HttpError(await response.text(), response.status);
  }

  return response.json();
}

export default updateProjectStatus;
