import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import db from "../../database";
import { automationRunTable, automationTable } from "../../database/schema";
import { type LastRun, toPublicAutomation } from "../serialize";

/**
 * Las reglas de un proyecto, o las del espacio si `projectId` es nulo, con su
 * ultima ejecucion. Las archivadas no salen.
 */
export async function listAutomations({
  workspaceId,
  projectId,
  teamId,
}: {
  workspaceId: string;
  projectId: string | null;
  /** Solo los envios del stand-up de ese departamento. */
  teamId?: string;
}) {
  const rows = await db
    .select()
    .from(automationTable)
    .where(
      and(
        eq(automationTable.workspaceId, workspaceId),
        projectId
          ? eq(automationTable.projectId, projectId)
          : isNull(automationTable.projectId),
        isNull(automationTable.archivedAt),
        teamId ? eq(automationTable.teamId, teamId) : undefined,
      ),
    )
    .orderBy(automationTable.createdAt);

  const lastRuns = new Map<string, LastRun>();
  if (rows.length > 0) {
    // Una fila por regla, la mas reciente: el indice (automation_id,
    // started_at desc) la sirve sin ordenar el historial entero.
    const runs = await db
      .selectDistinctOn([automationRunTable.automationId], {
        automationId: automationRunTable.automationId,
        status: automationRunTable.status,
        startedAt: automationRunTable.startedAt,
      })
      .from(automationRunTable)
      .where(
        inArray(
          automationRunTable.automationId,
          rows.map((row) => row.id),
        ),
      )
      .orderBy(
        automationRunTable.automationId,
        desc(automationRunTable.startedAt),
      );
    for (const run of runs) {
      lastRuns.set(run.automationId, {
        status: run.status,
        startedAt: run.startedAt,
      });
    }
  }

  return rows.map((row) =>
    toPublicAutomation(row, lastRuns.get(row.id) ?? null),
  );
}
