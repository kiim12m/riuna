import { and, eq } from "drizzle-orm";
import db from "../../database";
import { reviewPrivateTable, reviewTable } from "../../database/schema";

export type ReviewPeriod = "day" | "week";

/** Las cifras de un dia al cerrarlo. */
export type DaySummary = {
  /** Tareas terminadas ese dia. */
  done: number;
  /** Segundos registrados ese dia. */
  workedSeconds: number;
  /** Pendientes que se movieron a otro dia al cerrar. */
  moved: number;
  /** Pendientes que se sacaron del plan al cerrar. */
  unplanned: number;
  /**
   * Sesiones del modo foco de ese dia (ADR 056). Falta en los cierres de
   * antes de que existiera el modo foco.
   */
  focusSessions?: number;
};

/** Las cifras de una semana al revisarla. */
export type WeekSummary = {
  done: number;
  workedSeconds: number;
  /** Suma de la estimacion de lo terminado con estimacion y tiempo registrado. */
  estimatedSeconds: number;
  /** Lo registrado en esas mismas tareas: frente a lo estimado, la precision. */
  loggedOnEstimatedSeconds: number;
};

/**
 * El cierre de un periodo de quien mira, con su valoracion. Solo lo lee la
 * propia persona: la parte privada sale de este modulo y de ningun otro
 * (ADR 054).
 */
export default async function getReview<Summary>({
  workspaceId,
  userId,
  period,
  start,
}: {
  workspaceId: string;
  userId: string;
  period: ReviewPeriod;
  start: Date;
}) {
  const [row] = await db
    .select({
      closedAt: reviewTable.closedAt,
      blockers: reviewTable.blockers,
      summary: reviewTable.summary,
      impact: reviewPrivateTable.impact,
      energy: reviewPrivateTable.energy,
      note: reviewPrivateTable.note,
      hasPrivate: reviewPrivateTable.reviewId,
    })
    .from(reviewTable)
    .leftJoin(
      reviewPrivateTable,
      eq(reviewPrivateTable.reviewId, reviewTable.id),
    )
    .where(
      and(
        eq(reviewTable.userId, userId),
        eq(reviewTable.workspaceId, workspaceId),
        eq(reviewTable.period, period),
        eq(reviewTable.periodStart, start),
      ),
    );

  if (!row) return { review: null, private: null };

  return {
    review: {
      closedAt: row.closedAt,
      blockers: row.blockers,
      summary: row.summary as Summary,
    },
    private: row.hasPrivate
      ? { impact: row.impact, energy: row.energy, note: row.note }
      : null,
  };
}
