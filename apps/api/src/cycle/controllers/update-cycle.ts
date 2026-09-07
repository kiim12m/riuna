import { eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { cycleTable } from "../../database/schema";
import { publishEvent } from "../../events";

/**
 * Que transiciones de estado se permiten.
 *
 * `closed` no sale de aqui: se cierra con `POST /cycle/:id/close`, que ademas
 * tiene que decidir que pasa con lo que quedo sin terminar. Reabrir un ciclo
 * cerrado tampoco, porque la velocidad ya se dio por congelada y volver atras
 * cambiaria la historia.
 */
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  planned: ["active"],
  active: ["planned"],
  closed: [],
};

/**
 * Drizzle envuelve el error de Postgres en un `DrizzleQueryError` y deja el
 * original en `cause`, asi que el codigo **no** esta en el primer nivel. Se
 * miran los dos por si la version cambia de opinion.
 */
function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const candidate = error as { code?: string; cause?: { code?: string } };
  return candidate.code === "23505" || candidate.cause?.code === "23505";
}

async function updateCycle({
  cycleId,
  name,
  goal,
  startDate,
  endDate,
  status,
  currentUserId,
}: {
  cycleId: string;
  name?: string;
  goal?: string | null;
  startDate?: Date;
  endDate?: Date;
  status?: "planned" | "active";
  currentUserId: string;
}) {
  const existing = await db.query.cycleTable.findFirst({
    where: eq(cycleTable.id, cycleId),
  });

  if (!existing) {
    throw new HTTPException(404, { message: "Cycle not found" });
  }

  const changes: Partial<typeof cycleTable.$inferInsert> = {};

  if (name !== undefined) {
    const trimmed = name.trim();
    if (!trimmed) {
      throw new HTTPException(400, { message: "Cycle name is required" });
    }
    changes.name = trimmed;
  }

  if (goal !== undefined) changes.goal = goal;
  if (startDate !== undefined) changes.startDate = startDate;
  if (endDate !== undefined) changes.endDate = endDate;

  if (status !== undefined && status !== existing.status) {
    if (!ALLOWED_TRANSITIONS[existing.status]?.includes(status)) {
      throw new HTTPException(400, {
        message: `A ${existing.status} cycle cannot become ${status}`,
      });
    }
    changes.status = status;
  }

  const nextStart = changes.startDate ?? existing.startDate;
  const nextEnd = changes.endDate ?? existing.endDate;
  if (nextEnd < nextStart) {
    throw new HTTPException(400, {
      message: "The cycle end date cannot be before its start date",
    });
  }

  if (Object.keys(changes).length === 0) {
    return existing;
  }

  let updated: typeof cycleTable.$inferSelect | undefined;

  try {
    [updated] = await db
      .update(cycleTable)
      .set(changes)
      .where(eq(cycleTable.id, cycleId))
      .returning();
  } catch (error) {
    // `cycle_one_active_per_project` es un indice parcial unico, asi que dos
    // activaciones simultaneas llegan aqui como violacion de unicidad. Se
    // traduce a un 409 legible en vez de dejar salir un 500.
    if (changes.status === "active" && isUniqueViolation(error)) {
      throw new HTTPException(409, {
        message: "This project already has an active cycle",
      });
    }
    throw error;
  }

  if (!updated) {
    throw new HTTPException(500, { message: "Failed to update cycle" });
  }

  await publishEvent("cycle.changed", {
    projectId: updated.projectId,
    cycleId: updated.id,
    userId: currentUserId,
  });

  return updated;
}

export default updateCycle;
