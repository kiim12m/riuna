import { HTTPException } from "hono/http-exception";
import db from "../database";
import { reviewPrivateTable, reviewTable } from "../database/schema";
import type { ReviewPeriod } from "./controllers/get-review";

/**
 * Guarda un cierre y su valoracion en una sola transaccion: lo visible en
 * `review`, lo privado en `review_private` (ADR 054). Cerrar otra vez el
 * mismo periodo lo actualiza.
 */
export async function saveReview({
  workspaceId,
  userId,
  period,
  start,
  blockers,
  summary,
  impact,
  energy,
  note,
}: {
  workspaceId: string;
  userId: string;
  period: ReviewPeriod;
  start: Date;
  blockers: string | null;
  summary: Record<string, number>;
  impact: number | null;
  energy: number | null;
  note: string | null;
}) {
  await db.transaction(async (tx) => {
    const now = new Date();
    const [review] = await tx
      .insert(reviewTable)
      .values({
        workspaceId,
        userId,
        period,
        periodStart: start,
        blockers,
        summary,
        closedAt: now,
      })
      .onConflictDoUpdate({
        target: [
          reviewTable.userId,
          reviewTable.workspaceId,
          reviewTable.period,
          reviewTable.periodStart,
        ],
        set: { blockers, summary, closedAt: now, updatedAt: now },
      })
      .returning({ id: reviewTable.id });

    if (!review) {
      throw new HTTPException(500, { message: "Failed to save the review" });
    }

    await tx
      .insert(reviewPrivateTable)
      .values({ reviewId: review.id, impact, energy, note })
      .onConflictDoUpdate({
        target: reviewPrivateTable.reviewId,
        set: { impact, energy, note, updatedAt: now },
      });
  });
}
