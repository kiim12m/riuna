import { and, asc, eq, inArray, like, max } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import {
  assetTable,
  columnTable,
  projectTable,
  taskTable,
} from "../../database/schema";
import { publishEvent } from "../../events";
import { rebasePath, rootPath, subtreePattern } from "../tree";
import claimTaskNumbers from "./claim-task-numbers";

type DbOrTx = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

function isSameProjectMove(
  sourceProjectId: string,
  destinationProjectId: string,
) {
  return sourceProjectId === destinationProjectId;
}

async function resolveDestinationStatus(
  destinationProjectId: string,
  currentStatus: string,
  requestedStatus?: string,
) {
  const destinationColumns = await db
    .select({
      id: columnTable.id,
      slug: columnTable.slug,
      position: columnTable.position,
    })
    .from(columnTable)
    .where(eq(columnTable.projectId, destinationProjectId))
    .orderBy(asc(columnTable.position));

  const [firstColumn] = destinationColumns;

  if (!firstColumn) {
    throw new HTTPException(400, {
      message: "Destination project does not have a workflow",
    });
  }

  const requestedColumn = requestedStatus
    ? destinationColumns.find((column) => column.slug === requestedStatus)
    : null;

  if (requestedStatus && !requestedColumn) {
    throw new HTTPException(400, {
      message: "Selected status is not valid for the destination project",
    });
  }

  const matchingCurrentColumn = destinationColumns.find(
    (column) => column.slug === currentStatus,
  );

  return requestedColumn ?? matchingCurrentColumn ?? firstColumn;
}

async function getNextTaskPosition(
  dbOrTx: DbOrTx,
  projectId: string,
  status: string,
  columnId: string,
) {
  const [maxPositionResult] = await dbOrTx
    .select({ maxPosition: max(taskTable.position) })
    .from(taskTable)
    .where(
      and(
        eq(taskTable.projectId, projectId),
        eq(taskTable.status, status),
        eq(taskTable.columnId, columnId),
      ),
    );

  return (maxPositionResult?.maxPosition ?? 0) + 1;
}

async function moveTask({
  taskId,
  destinationProjectId,
  destinationStatus,
  currentUserId,
}: {
  taskId: string;
  destinationProjectId: string;
  destinationStatus?: string;
  currentUserId: string;
}) {
  const existingTask = await db.query.taskTable.findFirst({
    where: eq(taskTable.id, taskId),
  });

  if (!existingTask) {
    throw new HTTPException(404, {
      message: "Task not found",
    });
  }

  if (isSameProjectMove(existingTask.projectId, destinationProjectId)) {
    throw new HTTPException(400, {
      message: "Task is already in that project",
    });
  }

  const [sourceProject, destinationProject] = await Promise.all([
    db.query.projectTable.findFirst({
      where: eq(projectTable.id, existingTask.projectId),
    }),
    db.query.projectTable.findFirst({
      where: eq(projectTable.id, destinationProjectId),
    }),
  ]);

  if (!sourceProject || !destinationProject) {
    throw new HTTPException(404, {
      message: "Project not found",
    });
  }

  if (sourceProject.workspaceId !== destinationProject.workspaceId) {
    throw new HTTPException(400, {
      message: "Tasks can only be moved within the same workspace",
    });
  }

  const resolvedColumn = await resolveDestinationStatus(
    destinationProjectId,
    existingTask.status,
    destinationStatus,
  );

  // Padre e hija comparten proyecto siempre (ADR 011), asi que mover una
  // tarea es mover su rama entera. La tarea movida pasa a ser raiz en el
  // destino: su padre se queda donde estaba.
  const subtree = await db
    .select({
      id: taskTable.id,
      path: taskTable.path,
      depth: taskTable.depth,
    })
    .from(taskTable)
    .where(
      and(
        eq(taskTable.projectId, existingTask.projectId),
        like(taskTable.path, subtreePattern(existingTask.path)),
      ),
    )
    .orderBy(asc(taskTable.depth));

  const descendants = subtree.filter((node) => node.id !== taskId);
  const newRootPath = rootPath(taskId);

  const movedTask = await db.transaction(async (tx) => {
    const [firstNumber, nextPosition] = await Promise.all([
      claimTaskNumbers(destinationProjectId, subtree.length, tx),
      getNextTaskPosition(
        tx,
        destinationProjectId,
        resolvedColumn.slug,
        resolvedColumn.id,
      ),
    ]);

    const [updatedTask] = await tx
      .update(taskTable)
      .set({
        projectId: destinationProjectId,
        status: resolvedColumn.slug,
        columnId: resolvedColumn.id,
        number: firstNumber,
        position: nextPosition,
        parentId: null,
        path: newRootPath,
        depth: 0,
      })
      .where(eq(taskTable.id, taskId))
      .returning();

    if (!updatedTask) {
      throw new HTTPException(500, {
        message: "Failed to move task",
      });
    }

    // Los descendientes conservan su forma —quien cuelga de quien— y solo
    // cambian de proyecto, de numero y de raiz del camino. El estado se
    // resuelve por separado: la columna del origen puede no existir aqui.
    let number = firstNumber + 1;
    for (const descendant of descendants) {
      await tx
        .update(taskTable)
        .set({
          projectId: destinationProjectId,
          status: resolvedColumn.slug,
          columnId: resolvedColumn.id,
          number: number++,
          path: rebasePath(descendant.path, existingTask.path, newRootPath),
          depth: descendant.depth - existingTask.depth,
        })
        .where(eq(taskTable.id, descendant.id));
    }

    await tx
      .update(assetTable)
      .set({ projectId: destinationProjectId })
      .where(
        inArray(
          assetTable.taskId,
          subtree.map((node) => node.id),
        ),
      );

    return updatedTask;
  });

  await publishEvent("task.moved", {
    taskId,
    type: "moved",
    userId: currentUserId,
    fromProjectId: sourceProject.id,
    fromProjectName: sourceProject.name,
    toProjectId: destinationProject.id,
    toProjectName: destinationProject.name,
    oldStatus: existingTask.status,
    newStatus: resolvedColumn.slug,
  });

  return {
    task: movedTask,
    sourceProjectId: sourceProject.id,
    destinationProjectId: destinationProject.id,
  };
}

export default moveTask;
