import { client } from "@riuna/libs";
import { HttpError } from "@/lib/http-error";

// La hoja de SERVITEC de vuelta (ADR 069). Como el asistente de Excel, el
// fichero se sube dos veces: una para analizar y otra para importar.

export type ServitecChoice =
  | { action: "map"; projectId: string }
  | { action: "create" }
  | { action: "skip" };

export type ServitecAnalysis = {
  rows: number;
  existing: number;
  comments: number;
  projects: Array<{ name: string; projectId: string | null; rows: number }>;
};

export type ServitecReport = {
  dryRun: boolean;
  rows: number;
  created: number;
  updated: number;
  failed: number;
  skipped: number;
  commentsAdded: number;
  commentsKept: number;
  projects: Array<{
    name: string;
    projectId: string | null;
    created: number;
    updated: number;
    failed: number;
    pending: number;
  }>;
  failures: Array<{ row: number; error: string }>;
};

async function unwrap(response: Response) {
  if (!response.ok) {
    throw new HttpError(await response.text(), response.status);
  }
  return response.json();
}

export async function analyzeServitecImport(workspaceId: string, file: File) {
  return (await unwrap(
    await client.task.import.servitec[":workspaceId"].analyze.$post({
      param: { workspaceId },
      form: { file },
    }),
  )) as ServitecAnalysis;
}

export async function importServitecSheet(
  workspaceId: string,
  file: File,
  choices: Record<string, ServitecChoice>,
  dryRun: boolean,
) {
  return (await unwrap(
    await client.task.import.servitec[":workspaceId"].$post({
      param: { workspaceId },
      form: {
        file,
        choices: JSON.stringify(choices),
        ...(dryRun ? { dryRun: "true" } : {}),
      },
    }),
  )) as ServitecReport;
}
