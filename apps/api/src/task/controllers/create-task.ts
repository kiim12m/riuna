import { and, eq, max } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { columnTable, taskTable, userTable } from "../../database/schema";
import { publishEvent } from "../../events";
import { refreshFormulasAfter } from "../../field/formula/refresh";
import {
  addWatchers,
  publishWatchersChanged,
} from "../../task-watcher/watchers";
import {
  assertAssignableUser,
  getProjectWorkspaceId,
} from "../../utils/assert-assignable-user";
import { syncTaskLinks } from "../../wiki/links";
import { scheduleAfter } from "../schedule/reschedule";
import { childTaskTreeFields, rootTaskTreeFields } from "../tree";
import { assertValidTaskStatus } from "../validate-task-fields";
import { syncPrimaryAssignee } from "./assignees";
import { claimTaskNumber } from "./claim-task-numbers";
import { lockProjectTree } from "./lock-project-tree";
import { resolveParentForNewTask } from "./update-task-parent";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

type CreateTaskInput = {
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
};

/**
 * Crea una tarea dentro de una transaccion ajena, y devuelve aparte lo que solo
 * puede pasar cuando esa transaccion se confirme: avisos, recalculos y
 * replanificacion. Asi una plantilla o una recurrencia crean todas sus tareas
 * en una sola transaccion, y si algo falla no queda nada ni se ha avisado de
 * nada (auditoria 1.9).
 *
 * Todo se lee por `tx`, y despues del cerrojo: las columnas de un proyecto que
 * se esta creando en la misma transaccion no existen para el pool, y la
 * posicion leida antes del cerrojo podia repetirse con otra alta a la vez.
 */
export async function createTaskInTransaction(
  tx: Tx,
  {
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
  }: CreateTaskInput,
) {
  const resolvedStatus = status || "to-do";
  const resolvedPriority = priority || "no-priority";

  const normalizedUserId = userId?.trim() || undefined;

  await lockProjectTree(tx, projectId);
  await assertValidTaskStatus(resolvedStatus, projectId, tx);

  let assignee: { name: string } | undefined;

  if (normalizedUserId) {
    await assertAssignableUser(
      normalizedUserId,
      await getProjectWorkspaceId(projectId, tx),
      tx,
    );

    [assignee] = await tx
      .select({ name: userTable.name })
      .from(userTable)
      .where(eq(userTable.id, normalizedUserId));
  }

  const column = await tx.query.columnTable.findFirst({
    where: and(
      eq(columnTable.projectId, projectId),
      eq(columnTable.slug, resolvedStatus),
    ),
  });

  const [maxPositionResult] = await tx
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

  // El padre se resuelve ya con el cerrojo tomado: resolverlo antes congelaba
  // su `path`, y si el padre se reparentaba en ese hueco la hija nacia fuera
  // del subarbol de su propio padre. Ver `lockProjectTree`.
  const parent = await resolveParentForNewTask(projectId, parentId, tx);
  const treeFields = parent
    ? childTaskTreeFields(parent)
    : rootTaskTreeFields();

  const taskNumber = await claimTaskNumber(projectId, tx);

  const [createdTask] = await tx
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

  if (!createdTask) {
    throw new HTTPException(500, {
      message: "Failed to create task",
    });
  }

  await syncPrimaryAssignee(createdTask.id, null, createdTask.userId, tx);
  if (creatorWatches) {
    await addWatchers(createdTask.id, [currentUserId], tx);
  }

  const afterCommit = async () => {
    // Lo calculado de la tarea nueva y, si tiene estimacion, de su rama (ADR 090).
    await refreshFormulasAfter({ projectId, taskIds: [createdTask.id] });
    // Las paginas de la wiki que enlaza su descripcion (ADR 092).
    if (createdTask.description) {
      await syncTaskLinks(createdTask.id, createdTask.description);
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
  };

  return {
    task: { ...createdTask, assigneeName: assignee?.name },
    afterCommit,
  };
}

async function createTask(input: CreateTaskInput) {
  const { task, afterCommit } = await db.transaction((tx) =>
    createTaskInTransaction(tx, input),
  );
  await afterCommit();
  return task;
}

export default createTask;
