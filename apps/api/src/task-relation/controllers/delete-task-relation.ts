import { eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { taskRelationTable, taskTable } from "../../database/schema";
import { publishEvent } from "../../events";
import { PRECEDES, scheduleAfter } from "../../task/schedule/reschedule";

async function deleteTaskRelation(id: string, userId: string) {
  const [rel] = await db
    .select({
      sourceTaskId: taskRelationTable.sourceTaskId,
      targetTaskId: taskRelationTable.targetTaskId,
      relationType: taskRelationTable.relationType,
    })
    .from(taskRelationTable)
    .where(eq(taskRelationTable.id, id))
    .limit(1);

  if (!rel) {
    throw new HTTPException(404, {
      message: "Task relation not found",
    });
  }

  const [task] = await db
    .select({ projectId: taskTable.projectId })
    .from(taskTable)
    .where(eq(taskTable.id, rel.sourceTaskId))
    .limit(1);

  const [relation] = await db
    .delete(taskRelationTable)
    .where(eq(taskRelationTable.id, id))
    .returning();

  if (!relation) {
    throw new HTTPException(404, {
      message: "Task relation not found",
    });
  }

  if (task) {
    await publishEvent("task-relation.deleted", {
      ...relation,
      taskId: rel.sourceTaskId,
      sourceTaskId: rel.sourceTaskId,
      targetTaskId: rel.targetTaskId,
      projectId: task.projectId,
      userId,
    });

    // Sin esa predecesora, la sucesora puede adelantarse (ADR 084).
    if (rel.relationType === PRECEDES) {
      await publishEvent("task.precedence_changed", {
        taskId: rel.targetTaskId,
        projectId: task.projectId,
        userId,
        predecessorId: rel.sourceTaskId,
        action: "removed",
        type: "precedence_changed",
      });
      await scheduleAfter({
        projectId: task.projectId,
        taskIds: [rel.targetTaskId],
        actorId: userId,
        origin: rel.sourceTaskId,
      });
    }
  }

  return relation;
}

export default deleteTaskRelation;
