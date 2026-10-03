import { client } from "@riuna/libs";
import { HttpError } from "@/lib/http-error";

/** Quien es responsable de quien mira (ADR 059), para su aviso. */
export async function getMyLeads(workspaceId: string) {
  const response = await client.lead["my-leads"].$get({
    query: { workspaceId },
  });

  if (!response.ok) {
    throw new HttpError(await response.text(), response.status);
  }

  return response.json();
}

/** Quien es responsable de que equipo, para el diálogo de equipos. */
export async function listTeamLeads(workspaceId: string) {
  const response = await client["team-lead"].$get({ query: { workspaceId } });

  if (!response.ok) {
    throw new HttpError(await response.text(), response.status);
  }

  return response.json();
}

export async function setTeamLead(
  workspaceId: string,
  input: { teamId: string; userId: string; isLead: boolean },
) {
  const response = await client["team-lead"].$put({
    query: { workspaceId },
    json: input,
  });

  if (!response.ok) {
    throw new HttpError(await response.text(), response.status);
  }

  return response.json();
}
