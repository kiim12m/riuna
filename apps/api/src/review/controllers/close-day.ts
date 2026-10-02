import { HTTPException } from "hono/http-exception";
import planBulk from "../../planner/controllers/plan-bulk";
import getToday from "../../today/controllers/get-today";
import {
  parseServerDay,
  serverDayKey,
  startOfServerDay,
} from "../../utils/day-boundaries";
import { saveReview } from "../save-review";
import getReview, { type DaySummary } from "./get-review";

export type CloseDayDecision = {
  taskId: string;
  /** `yyyy-mm-dd` posterior al dia que se cierra, o `null`: fuera del plan. */
  plannedDate: string | null;
};

/**
 * Cierra un dia (ADR 054): decide que pasa con cada pendiente, guarda lo que
 * el responsable podra ver -bloqueos y cifras- y, aparte, la valoracion.
 *
 * **Pendiente** es lo mismo que Hoy enseña para ese dia: lo planificado y lo
 * de dias anteriores, sin terminar. Cada una necesita su decision -mover a
 * otro dia o sacar del plan-; sin ellas, 400, porque cerrar el dia es
 * justamente no dejar nada colgando. Una decision sobre algo que ya no esta
 * pendiente -se termino mientras tanto- se ignora.
 *
 * Las cifras salen de `getToday` con el mediodia de ese dia como "ahora", la
 * misma composicion que enseñaba la pantalla.
 */
export default async function closeDay({
  workspaceId,
  userId,
  date,
  decisions,
  blockers,
  impact,
  energy,
  note,
}: {
  workspaceId: string;
  userId: string;
  /** `yyyy-mm-dd`. */
  date: string;
  decisions: CloseDayDecision[];
  blockers: string | null;
  impact: number | null;
  energy: number | null;
  note: string | null;
}) {
  const day = parseServerDay(date, "date");
  if (day > startOfServerDay(new Date())) {
    throw new HTTPException(400, { message: "A future day cannot be closed" });
  }

  const midday = new Date(day);
  midday.setHours(12, 0, 0, 0);
  const view = await getToday({ workspaceId, userId, now: midday });

  const pending = new Set(
    [...view.previous, ...view.planned].map((entry) => entry.id),
  );
  const decided = new Map(
    decisions
      .filter((decision) => pending.has(decision.taskId))
      .map((decision) => [decision.taskId, decision.plannedDate]),
  );

  const missing = [...pending].filter((id) => !decided.has(id));
  if (missing.length > 0) {
    throw new HTTPException(400, {
      message: `Every pending task needs a decision: ${missing.join(", ")}`,
    });
  }

  const dayKey = serverDayKey(day);
  const byDate = new Map<string | null, string[]>();
  for (const [taskId, plannedDate] of decided) {
    if (plannedDate !== null && plannedDate <= dayKey) {
      throw new HTTPException(400, {
        message: "A pending task can only move to a later day",
      });
    }
    byDate.set(plannedDate, [...(byDate.get(plannedDate) ?? []), taskId]);
  }

  for (const [plannedDate, taskIds] of byDate) {
    await planBulk({
      workspaceId,
      userId,
      taskIds,
      plannedDate:
        plannedDate === null
          ? null
          : parseServerDay(plannedDate, "plannedDate"),
    });
  }

  const previous = await getReview<DaySummary>({
    workspaceId,
    userId,
    period: "day",
    start: day,
  });
  const moved = [...decided.values()].filter((value) => value !== null).length;
  // Acumuladas: cerrar dos veces el mismo dia no borra lo que se movio la
  // primera, que ya no esta pendiente la segunda.
  const summary: DaySummary = {
    done: view.done.length,
    workedSeconds: view.totals.workedToday,
    moved: (previous.review?.summary.moved ?? 0) + moved,
    unplanned:
      (previous.review?.summary.unplanned ?? 0) + (decided.size - moved),
  };

  await saveReview({
    workspaceId,
    userId,
    period: "day",
    start: day,
    blockers,
    summary,
    impact,
    energy,
    note,
  });

  return getReview<DaySummary>({
    workspaceId,
    userId,
    period: "day",
    start: day,
  });
}
