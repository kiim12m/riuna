import { and, between, eq, isNotNull, isNull, ne } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { projectTable, taskTable } from "../../database/schema";
import { assignedCondition } from "../../my-work/scope";
import { loggedSecondsByTask } from "../../planner/queries";
import getTimeSheet from "../../time-sheet/controllers/get-time-sheet";
import {
  addDays,
  endOfServerDay,
  startOfServerDay,
} from "../../utils/day-boundaries";
import { saveReview } from "../save-review";
import getReview, { type WeekSummary } from "./get-review";

/**
 * Las cifras de una semana -siete dias desde `start`- de quien mira: lo que
 * termino de lo suyo, lo que registro y, de lo terminado que estaba estimado
 * y medido, cuanto estimo frente a cuanto le llevo de verdad.
 */
export async function weekStats({
  workspaceId,
  userId,
  start,
}: {
  workspaceId: string;
  userId: string;
  start: Date;
}): Promise<WeekSummary> {
  const end = endOfServerDay(addDays(start, 6));

  const [doneRows, timeSheet] = await Promise.all([
    db
      .select({ id: taskTable.id, estimate: taskTable.estimate })
      .from(taskTable)
      .innerJoin(projectTable, eq(taskTable.projectId, projectTable.id))
      .where(
        and(
          eq(projectTable.workspaceId, workspaceId),
          isNull(projectTable.archivedAt),
          ne(taskTable.status, "archived"),
          isNotNull(taskTable.completedAt),
          between(taskTable.completedAt, start, end),
          assignedCondition(userId),
        ),
      ),
    getTimeSheet({
      workspaceId,
      userId,
      windowStart: start,
      windowEnd: end,
      groupBy: "day",
    }),
  ]);

  // Solo lo que tiene estimacion **y** tiempo registrado: una tarea terminada
  // sin registrar nada no dice que se tardara menos, sino que no se midio.
  const withEstimate = doneRows.filter((row) => (row.estimate ?? 0) > 0);
  const logged = await loggedSecondsByTask(withEstimate.map((row) => row.id));
  const estimated = withEstimate.filter((row) => (logged.get(row.id) ?? 0) > 0);

  return {
    done: doneRows.length,
    workedSeconds: timeSheet.totalSeconds,
    estimatedSeconds: estimated.reduce(
      (total, row) => total + (row.estimate ?? 0),
      0,
    ),
    loggedOnEstimatedSeconds: estimated.reduce(
      (total, row) => total + (logged.get(row.id) ?? 0),
      0,
    ),
  };
}

/** La revision guardada de una semana, con sus cifras al dia. */
export async function getWeekReview(input: {
  workspaceId: string;
  userId: string;
  start: Date;
}) {
  const [stored, stats] = await Promise.all([
    getReview<WeekSummary>({ ...input, period: "week" }),
    weekStats(input),
  ]);
  return { ...stored, stats };
}

/**
 * Cierra la revision semanal (sub-bloque 2.3): bloqueos y cifras visibles,
 * valoracion aparte, como el cierre del dia (ADR 054). Sin decisiones
 * obligatorias: lo que se mueve durante la revision ya se ha guardado en sus
 * pasos.
 */
export async function closeWeek({
  workspaceId,
  userId,
  start,
  blockers,
  impact,
  energy,
  note,
}: {
  workspaceId: string;
  userId: string;
  start: Date;
  blockers: string | null;
  impact: number | null;
  energy: number | null;
  note: string | null;
}) {
  if (start > startOfServerDay(new Date())) {
    throw new HTTPException(400, {
      message: "A week that has not started cannot be reviewed",
    });
  }

  const stats = await weekStats({ workspaceId, userId, start });
  await saveReview({
    workspaceId,
    userId,
    period: "week",
    start,
    blockers,
    summary: stats,
    impact,
    energy,
    note,
  });

  return getWeekReview({ workspaceId, userId, start });
}
