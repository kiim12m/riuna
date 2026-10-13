import { client } from "@riuna/libs";

type TreeSettings = {
  cascadeClose?: boolean;
  cascadeArchive?: boolean;
  maxTaskDepth?: number;
  /** El progreso de rama pesa por la estimacion (ADR 083). */
  weightedProgress?: boolean;
};

async function updateProjectTreeSettings(
  projectId: string,
  settings: TreeSettings,
) {
  const response = await client.project[":id"]["tree-settings"].$patch({
    param: { id: projectId },
    json: settings,
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}

export default updateProjectTreeSettings;
