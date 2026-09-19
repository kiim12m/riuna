import { and, count, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { goalTable, goalTargetTable } from "../../database/schema";
import { MAX_TARGETS_PER_GOAL, type TargetConfig } from "../target-config";

export async function createGoal(input: {
  workspaceId: string;
  userId: string;
  name: string;
  description?: string | null;
  startsAt: Date;
  endsAt: Date;
}) {
  const [existing] = await db
    .select({ total: count() })
    .from(goalTable)
    .where(
      and(
        eq(goalTable.workspaceId, input.workspaceId),
        eq(goalTable.createdBy, input.userId),
      ),
    );

  const [goal] = await db
    .insert(goalTable)
    .values({
      workspaceId: input.workspaceId,
      createdBy: input.userId,
      name: input.name,
      description: input.description ?? null,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      position: Number(existing?.total ?? 0),
    })
    .returning();

  return goal;
}

export async function updateGoal(
  id: string,
  data: {
    name?: string;
    description?: string | null;
    startsAt?: Date;
    endsAt?: Date;
    isShared?: boolean;
  },
) {
  const [goal] = await db
    .update(goalTable)
    .set({
      ...(data.name !== undefined && { name: data.name }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.startsAt !== undefined && { startsAt: data.startsAt }),
      ...(data.endsAt !== undefined && { endsAt: data.endsAt }),
      ...(data.isShared !== undefined && { isShared: data.isShared }),
    })
    .where(eq(goalTable.id, id))
    .returning();

  if (!goal) {
    throw new HTTPException(404, { message: "Goal not found" });
  }

  return goal;
}

export async function deleteGoal(id: string) {
  // Los resultados clave caen con el objetivo por la clave ajena en cascada.
  const [goal] = await db
    .delete(goalTable)
    .where(eq(goalTable.id, id))
    .returning();

  if (!goal) {
    throw new HTTPException(404, { message: "Goal not found" });
  }

  return goal;
}

export async function createTarget(input: {
  goalId: string;
  projectId?: string | null;
  name: string;
  targetValue: number;
  config: TargetConfig;
}) {
  const [existing] = await db
    .select({ total: count() })
    .from(goalTargetTable)
    .where(eq(goalTargetTable.goalId, input.goalId));

  const position = Number(existing?.total ?? 0);

  if (position >= MAX_TARGETS_PER_GOAL) {
    throw new HTTPException(422, {
      message: `A goal holds at most ${MAX_TARGETS_PER_GOAL} key results`,
    });
  }

  const [target] = await db
    .insert(goalTargetTable)
    .values({
      goalId: input.goalId,
      projectId: input.projectId ?? null,
      name: input.name,
      targetValue: input.targetValue,
      config: input.config,
      position,
    })
    .returning();

  return target;
}

export async function updateTarget(
  id: string,
  data: {
    name?: string;
    targetValue?: number;
    projectId?: string | null;
    config?: TargetConfig;
  },
) {
  const [target] = await db
    .update(goalTargetTable)
    .set({
      ...(data.name !== undefined && { name: data.name }),
      ...(data.targetValue !== undefined && { targetValue: data.targetValue }),
      ...(data.projectId !== undefined && { projectId: data.projectId }),
      ...(data.config !== undefined && { config: data.config }),
    })
    .where(eq(goalTargetTable.id, id))
    .returning();

  if (!target) {
    throw new HTTPException(404, { message: "Key result not found" });
  }

  return target;
}

export async function deleteTarget(id: string) {
  const [target] = await db
    .delete(goalTargetTable)
    .where(eq(goalTargetTable.id, id))
    .returning();

  if (!target) {
    throw new HTTPException(404, { message: "Key result not found" });
  }

  return target;
}
