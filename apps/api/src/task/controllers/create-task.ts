import { and, eq, max } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { columnTable, taskTable, userTable } from "../../database/schema";
import { publishEvent } from "../../events";
import {
  addWatchers,
  publishWatchersChanged,
} from "../../task-watcher/watchers";
import {
  assertAssignableUser,
  getProjectWorkspaceId,
} from "../../utils/assert-assignable-user";
import { scheduleAfter } from "../schedule/reschedule";
import { childTaskTreeFields, rootTaskTreeFields } from "../tree";
import { assertValidTaskStatus } from "../validate-task-fields";
import { syncPrimaryAssignee } from "./assignees";
import { claimTaskNumber } from "./claim-task-numbers";
import { lockProjectTree } from "./lock-project-tree";
import { resolveParentForNewTask } from "./update-task-parent";

async function createTask({
  projectId,
  currentUserId,
  userId,
  title,
  status,
  startDate,
  dueDate,
  description,
  priority,
  parentId,
  estimate,
  isMilestone = false,
  creatorWatches = false,
}: {
  projectId: string;
  currentUserId: string;
  userId?: string;
  title: string;
  status: string;
  startDate?: Date;
  dueDate?: Date;
  description?: string;
  priority?: string;
  parentId?: string | null;
  estimate?: number | null;
  /** Un hito: una sola fecha y sin estimacion (ADR 082). */
  isMilestone?: boolean;
  /**
   * Quien la crea la observa (ADR 076). Solo lo piden quienes crean de una en
   * una —la interfaz, la API y la captura—: una plantilla, una recurrencia o
   * una automatizacion crearian decenas de golpe.
   */
  creatorWatches?: boolean;
}) {
  const resolvedStatus = status || "to-do";
  const resolvedPriority = priority || "no-priority";

  const normalizedUserId = userId?.trim() || undefined;

  await assertValidTaskStatus(resolvedStatus, projectId);

  let assignee: { name: string } | undefined;

  if (normalizedUserId) {
    await assertAssignableUser(
      normalizedUserId,
      await getProjectWorkspaceId(projectId),
    );

    [assignee] = await db
      .select({ name: userTable.name })
      .from(userTable)
      .where(eq(userTable.id, normalizedUserId));
  }

  const column = await db.query.columnTable.findFirst({
    where: and(
      eq(columnTable.projectId, projectId),
      eq(columnTable.slug, resolvedStatus),
    ),
  });

  const [maxPositionResult] = await db
    .select({ maxPosition: max(taskTable.position) })
    .from(taskTable)
    .where(
      and(
        eq(taskTable.projectId, projectId),
        column?.id
          ? eq(taskTable.columnId, column.id)
          : eq(taskTable.status, resolvedStatus),
      ),
    );

  const nextPosition = (maxPositionResult?.maxPosition ?? 0) + 1;

  // Un hito tiene una sola fecha: la del final, si llegan las dos.
  const milestoneDay = isMilestone ? (dueDate ?? startDate ?? null) : null;

  const createdTask = await db.transaction(async (tx) => {
    await lockProjectTree(tx, projectId);

    // El padre se resuelve ya con el cerrojo tomado: resolverlo antes congelaba
    // su `path`, y si el padre se reparentaba en ese hueco la hija nacia fuera
    // del subarbol de su propio padre. Ver `lockProjectTree`.
    const parent = await resolveParentForNewTask(projectId, parentId, tx);
    const treeFields = parent
      ? childTaskTreeFields(parent)
      : rootTaskTreeFields();

    const taskNumber = await claimTaskNumber(projectId, tx);

    const [task] = await tx
      .insert(taskTable)
      .values({
        ...treeFields,
        estimate: isMilestone ? null : (estimate ?? null),
        isMilestone,
        projectId,
        userId: normalizedUserId ?? null,
        title: title || "",
        status: resolvedStatus,
        columnId: column?.id ?? null,
        startDate: isMilestone ? milestoneDay : startDate || null,
        dueDate: isMilestone ? milestoneDay : dueDate || null,
        description: description || "",
        priority: resolvedPriority,
        number: taskNumber,
        position: nextPosition,
      })
      .returning();

    if (task) {
      await syncPrimaryAssignee(task.id, null, task.userId, tx);
      if (creatorWatches) {
        await addWatchers(task.id, [currentUserId], tx);
      }
    }

    return task;
  });

  if (!createdTask) {
    throw new HTTPException(500, {
      message: "Failed to create task",
    });
  }

  await publishEvent("task.created", {
    ...createdTask,
    taskId: createdTask.id,
    userId: createdTask.userId ?? "",
    currentUserId: currentUserId,
    type: "created",
    content: null,
  });

  // Una hija nueva puede cambiar las fechas automaticas de su rama (ADR 083).
  if (createdTask.parentId) {
    await scheduleAfter({
      projectId,
      taskIds: [createdTask.id],
      actorId: currentUserId,
    });
  }

  if (creatorWatches) {
    await publishWatchersChanged({
      taskId: createdTask.id,
      projectId,
      userId: currentUserId,
      addedIds: [currentUserId],
    });
  }

  return {
    ...createdTask,
    assigneeName: assignee?.name,
  };
}

export default createTask;
