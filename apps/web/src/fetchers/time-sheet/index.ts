import { client } from "@riuna/libs";
import { filenameFromResponse } from "@/lib/download-filename";
import { HttpError } from "@/lib/http-error";

export type TimeSheetGroupBy = "day" | "task" | "project";

export type TimeSheetQuery = {
  start?: string;
  end?: string;
  groupBy?: TimeSheetGroupBy;
};

export async function getTimeSheet(
  workspaceId: string,
  query: TimeSheetQuery = {},
) {
  const response = await client["time-sheet"].$get({
    query: {
      workspaceId,
      ...(query.start ? { start: query.start } : {}),
      ...(query.end ? { end: query.end } : {}),
      ...(query.groupBy ? { groupBy: query.groupBy } : {}),
    },
  });

  if (!response.ok) {
    throw new HttpError(await response.text(), response.status);
  }

  return response.json();
}

/** No pasa por `unwrap`: la respuesta es un fichero, no JSON. */
export async function exportTimeSheet(
  workspaceId: string,
  query: TimeSheetQuery = {},
) {
  const response = await client["time-sheet"].export.$get({
    query: {
      workspaceId,
      ...(query.start ? { start: query.start } : {}),
      ...(query.end ? { end: query.end } : {}),
      ...(query.groupBy ? { groupBy: query.groupBy } : {}),
    },
  });

  if (!response.ok) {
    throw new HttpError(await response.text(), response.status);
  }

  return {
    blob: await response.blob(),
    filename: filenameFromResponse(response, "parte-de-horas.xlsx"),
  };
}

export type TimeSheetResponse = Awaited<ReturnType<typeof getTimeSheet>>;
export type TimeSheetGroup = TimeSheetResponse["groups"][number];
