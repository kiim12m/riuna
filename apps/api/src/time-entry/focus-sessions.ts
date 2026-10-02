import { and, between, count, eq, isNotNull } from "drizzle-orm";
import db from "../database";
import { projectTable, taskTable, timeEntryTable } from "../database/schema";

/**
 * Cuantas sesiones de foco empezo una persona en un espacio entre dos
 * instantes (ADR 056): las entradas de tiempo con `focus_mode`. Los descansos
 * no son entradas, asi que no cuentan.
 */
export async function countFocusSessions({
  workspaceId,
  userId,
  start,
  end,
}: {
  workspaceId: string;
  userId: string;
  start: Date;
  end: Date;
}) {
  const [row] = await db
    .select({ sessions: count() })
    .from(timeEntryTable)
    .innerJoin(taskTable, eq(timeEntryTable.taskId, taskTable.id))
    .innerJoin(projectTable, eq(taskTable.projectId, projectTable.id))
    .where(
      and(
        eq(timeEntryTable.userId, userId),
        eq(projectTable.workspaceId, workspaceId),
        isNotNull(timeEntryTable.focusMode),
        between(timeEntryTable.startTime, start, end),
      ),
    );

  return Number(row?.sessions ?? 0);
}
