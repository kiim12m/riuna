import { and, eq, like, max, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { projectTable, taskTable } from "../../database/schema";
import { publishEvent } from "../../events";
import {
  childPath,
  DEFAULT_MAX_TASK_DEPTH,
  rejectReparent,
  rootPath,
  subtreePattern,
} from "../tree";

type TaskNode = {
  id: string;
  projectId: string;
  parentId: string | null;
  path: string;
  depth: number;
};

const REJECTION_MESSAGES: Record<string, string> = {
  self: "A task cannot be its own parent",
  cycle: "A task cannot be moved inside its own subtree",
  "cross-project": "Parent and child must belong to the same project",
  "too-deep": "The resulting subtree would exceed the project's depth limit",
};

async function loadTask(taskId: string): Promise<TaskNode> {
  const [task] = await db
    .select({
      id: taskTable.id,
      projectId: taskTable.projectId,
      parentId: taskTable.parentId,
      path: taskTable.path,
      depth: taskTable.depth,
    })
    .from(taskTable)
    .where(eq(taskTable.id, taskId))
    .limit(1);

  if (!task) {
    throw new HTTPException(404, { message: "Task not found" });
  }

  return task;
}

async function getMaxTaskDepth(projectId: string): Promise<number> {
  const [project] = await db
    .select({ maxTaskDepth: projectTable.maxTaskDepth })
    .from(projectTable)
    .where(eq(projectTable.id, projectId))
    .limit(1);

  return project?.maxTaskDepth ?? DEFAULT_MAX_TASK_DEPTH;
}

/**
 * Cuantos niveles cuelgan por debajo de la tarea: 0 si es una hoja. Se mide
 * antes de mover para no dejar descendientes por debajo del limite.
 */
async function getSubtreeHeight(task: TaskNode): Promise<number> {
  const [row] = await db
    .select({ maxDepth: max(taskTable.depth) })
    .from(taskTable)
    .where(
      and(
        eq(taskTable.projectId, task.projectId),
        like(taskTable.path, subtreePattern(task.path)),
      ),
    );

  return (row?.maxDepth ?? task.depth) - task.depth;
}

/**
 * Valida el padre de una tarea que todavia no existe. Devuelve el nodo padre
 * ya cargado para que quien crea la tarea pueda derivar su camino sin volver
 * a consultarlo.
 */
export async function resolveParentForNewTask(
  projectId: string,
  parentId: string | null | undefined,
): Promise<TaskNode | null> {
  const normalized = parentId?.trim();
  if (!normalized) return null;

  const parent = await loadTask(normalized);

  if (parent.projectId !== projectId) {
    throw new HTTPException(400, {
      message: REJECTION_MESSAGES["cross-project"],
    });
  }

  const maxDepth = await getMaxTaskDepth(projectId);
  if (parent.depth + 2 > maxDepth) {
    throw new HTTPException(400, { message: REJECTION_MESSAGES["too-deep"] });
  }

  return parent;
}

async function nextSiblingPosition(
  projectId: string,
  parentId: string | null,
): Promise<number> {
  const [row] = await db
    .select({ maxPosition: max(taskTable.position) })
    .from(taskTable)
    .where(
      and(
        eq(taskTable.projectId, projectId),
        parentId
          ? eq(taskTable.parentId, parentId)
          : sql`${taskTable.parentId} IS NULL`,
      ),
    );

  return (row?.maxPosition ?? 0) + 1;
}

/**
 * Cuelga una tarea de otra, o la promueve a raiz si `parentId` es nulo. Mueve
 * la rama entera: el camino de cada descendiente se reescribe sustituyendo el
 * prefijo viejo por el nuevo, en una sola sentencia, para que el arbol nunca
 * quede a medias entre dos formas.
 */
async function updateTaskParent({
  taskId,
  parentId,
  currentUserId,
}: {
  taskId: string;
  parentId: string | null;
  currentUserId: string;
}) {
  const task = await loadTask(taskId);
  const normalizedParentId = parentId?.trim() || null;

  if (normalizedParentId === task.parentId) {
    return task;
  }

  const parent = normalizedParentId ? await loadTask(normalizedParentId) : null;

  const [maxDepth, subtreeHeight] = await Promise.all([
    getMaxTaskDepth(task.projectId),
    getSubtreeHeight(task),
  ]);

  const rejection = rejectReparent({
    task,
    parent,
    subtreeHeight,
    maxDepth,
  });

  if (rejection) {
    throw new HTTPException(400, { message: REJECTION_MESSAGES[rejection] });
  }

  const oldPath = task.path;
  const newPath = parent ? childPath(parent.path, task.id) : rootPath(task.id);
  const depthDelta = (parent ? parent.depth + 1 : 0) - task.depth;
  const position = await nextSiblingPosition(
    task.projectId,
    parent?.id ?? null,
  );

  const updatedTask = await db.transaction(async (tx) => {
    // Toda la rama de una vez, la propia tarea incluida: `substring` a partir
    // del largo del prefijo viejo conserva el tramo que cuelga por debajo.
    await tx
      .update(taskTable)
      .set({
        // El `::int` no es adorno: sin el, Postgres no puede decidir entre
        // `substring(text from int)` y `substring(text from patron)` y falla.
        path: sql`${newPath} || substring(${taskTable.path} from ${oldPath.length + 1}::int)`,
        depth: sql`${taskTable.depth} + ${depthDelta}`,
      })
      .where(
        and(
          eq(taskTable.projectId, task.projectId),
          like(taskTable.path, subtreePattern(oldPath)),
        ),
      );

    const [updated] = await tx
      .update(taskTable)
      .set({ parentId: parent?.id ?? null, position })
      .where(eq(taskTable.id, taskId))
      .returning();

    return updated;
  });

  if (!updatedTask) {
    throw new HTTPException(500, { message: "Failed to reparent task" });
  }

  await publishEvent("task.parent_changed", {
    taskId,
    projectId: task.projectId,
    userId: currentUserId,
    type: "parent_changed",
    oldParentId: task.parentId,
    newParentId: parent?.id ?? null,
  });

  return updatedTask;
}

export default updateTaskParent;
