import { client } from "@riuna/libs";

export type ImportColumnMapping = {
  index: number;
  target:
    | { kind: "field"; field: string }
    | {
        kind: "custom";
        key: string;
        create?: { name: string; type: string; options?: string[] };
      }
    | { kind: "ignore" };
};

async function importTasks({
  projectId,
  file,
  mapping,
  source,
  dryRun,
}: {
  projectId: string;
  file: File;
  mapping: ImportColumnMapping[];
  source?: string;
  dryRun?: boolean;
}) {
  const response = await client.task.import[":projectId"].$post({
    param: { projectId },
    form: {
      file,
      mapping: JSON.stringify(mapping),
      ...(source ? { source } : {}),
      ...(dryRun ? { dryRun: "true" } : {}),
    },
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}

export default importTasks;
