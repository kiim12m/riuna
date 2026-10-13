import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { taskRelationTable, taskTable } from "../../database/schema";
import { publishEvent } from "../../events";
import { lockProjectTree } from "../../task/controllers/lock-project-tree";
import {
  PRECEDES,
  publishScheduleChanges,
  rescheduleProject,
} from "../../task/schedule/reschedule";
import { assertCanPrecede } from "../precedes";

async function projectOf(taskId: string) {
  const [task] = await db
    .select({ projectId: taskTable.projectId })
    .from(taskTable)
    .where(eq(taskTable.id, taskId))
    .limit(1);
  if (!task) throw new HTTPException(404, { message: "Task not found" });
  return task.projectId;
}

/**
 * `source` precede a `target` con un desfase en dias laborables (ADR 084).
 * La sucesora pasa a fechas automaticas —atada a su predecesora— y se
 * replanifica en la misma transaccion, bajo el cerrojo del proyecto.
 */
export async function createPrecedence({
  sourceTaskId,
  targetTaskId,
  lag,
  userId,
}: {
  sourceTaskId: string;
  targetTaskId: string;
  lag: number;
  userId: string;
}) {
  if (sourceTaskId === targetTaskId) {
    throw new HTTPException(400, {
      message: "Cannot create a relation between a task and itself",
    });
  }
  const projectId = await projectOf(sourceTaskId);

  const { relation, changes } = await db.transaction(async (tx) => {
    await lockProjectTree(tx, projectId);
    await assertCanPrecede(tx, sourceTaskId, targetTaskId);

    const [existing] = await tx
      .select({ id: taskRelationTable.id })
      .from(taskRelationTable)
      .where(
        and(
          eq(taskRelationTable.relationType, PRECEDES),
          eq(taskRelationTable.sourceTaskId, sourceTaskId),
          eq(taskRelationTable.targetTaskId, targetTaskId),
        ),
      )
      .limit(1);
    if (existing) {
      throw new HTTPException(409, { message: "This relation already exists" });
    }

    const [created] = await tx
      .insert(taskRelationTable)
      .values({ sourceTaskId, targetTaskId, relationType: PRECEDES, lag })
      .returning();
    if (!created) {
      throw new HTTPException(500, {
        message: "Failed to create the relation",
      });
    }
    await tx
      .update(taskTable)
      .set({ autoDates: true })
      .where(eq(taskTable.id, targetTaskId));
    const rescheduled = await rescheduleProject(tx, projectId, [targetTaskId]);
    return { relation: created, changes: rescheduled };
  });

  await publishEvent("task-relation.created", {
    ...relation,
    taskId: sourceTaskId,
    projectId,
    userId,
  });
  await publishEvent("task.precedence_changed", {
    taskId: targetTaskId,
    projectId,
    userId,
    predecessorId: sourceTaskId,
    lag,
    action: "added",
    type: "precedence_changed",
  });
  await publishScheduleChanges(changes, {
    projectId,
    actorId: userId,
    origin: sourceTaskId,
  });
  return relation;
}

/** Cambia el desfase de una precedencia y replanifica la sucesora. */
export async function updatePrecedenceLag({
  id,
  lag,
  userId,
}: {
  id: string;
  lag: number;
  userId: string;
}) {
  const [current] = await db
    .select()
    .from(taskRelationTable)
    .where(eq(taskRelationTable.id, id))
    .limit(1);
  if (!current || current.relationType !== PRECEDES) {
    throw new HTTPException(404, { message: "Precedence not found" });
  }
  const projectId = await projectOf(current.targetTaskId);

  const { relation, changes } = await db.transaction(async (tx) => {
    await lockProjectTree(tx, projectId);
    const [updated] = await tx
      .update(taskRelationTable)
      .set({ lag })
      .where(eq(taskRelationTable.id, id))
      .returning();
    const rescheduled = await rescheduleProject(tx, projectId, [
      current.targetTaskId,
    ]);
    return { relation: updated, changes: rescheduled };
  });

  await publishEvent("task.precedence_changed", {
    taskId: current.targetTaskId,
    projectId,
    userId,
    predecessorId: current.sourceTaskId,
    lag,
    action: "updated",
    type: "precedence_changed",
  });
  await publishEvent("task-relation.refresh", { projectId, userId });
  await publishScheduleChanges(changes, {
    projectId,
    actorId: userId,
    origin: current.sourceTaskId,
  });
  return relation;
}
