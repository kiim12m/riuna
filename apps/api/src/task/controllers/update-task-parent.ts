import { and, eq, like, max, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { projectTable, taskTable } from "../../database/schema";
import { publishEvent } from "../../events";
import { refreshFormulasAfter } from "../../field/formula/refresh";
import { scheduleAfter } from "../schedule/reschedule";
import {
  childPath,
  DEFAULT_MAX_TASK_DEPTH,
  rejectReparent,
  rootPath,
  subtreePattern,
} from "../tree";
import { lockProjectTree } from "./lock-project-tree";

export type TaskNode = {
  id: string;
  projectId: string;
  parentId: string | null;
  path: string;
  depth: number;
  // Opcional: el importador arma nodos sin leer la fila entera.
  isMilestone?: boolean;
};

export const REJECTION_MESSAGES: Record<string, string> = {
  self: "A task cannot be its own parent",
  cycle: "A task cannot be moved inside its own subtree",
  "cross-project": "Parent and child must belong to the same project",
  "too-deep": "The resulting subtree would exceed the project's depth limit",
  // Un hito es un punto en el tiempo, no un trabajo que se reparte (ADR 082).
  "milestone-parent": "A milestone cannot have subtasks",
};

type DbOrTx = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function loadTask(
  taskId: string,
  dbOrTx: DbOrTx = db,
): Promise<TaskNode> {
  const [task] = await dbOrTx
    .select({
      id: taskTable.id,
      projectId: taskTable.projectId,
      parentId: taskTable.parentId,
      path: taskTable.path,
      depth: taskTable.depth,
      isMilestone: taskTable.isMilestone,
    })
    .from(taskTable)
    .where(eq(taskTable.id, taskId))
    .limit(1);

  if (!task) {
    throw new HTTPException(404, { message: "Task not found" });
  }

  return task;
}

export async function getMaxTaskDepth(
  projectId: string,
  dbOrTx: DbOrTx = db,
): Promise<number> {
  const [project] = await dbOrTx
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
export async function getSubtreeHeight(
  task: TaskNode,
  dbOrTx: DbOrTx = db,
): Promise<number> {
  const [row] = await dbOrTx
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
  dbOrTx: DbOrTx = db,
): Promise<TaskNode | null> {
  const normalized = parentId?.trim();
  if (!normalized) return null;

  const parent = await loadTask(normalized, dbOrTx);

  if (parent.projectId !== projectId) {
    throw new HTTPException(400, {
      message: REJECTION_MESSAGES["cross-project"],
    });
  }

  if (parent.isMilestone) {
    throw new HTTPException(400, {
      message: REJECTION_MESSAGES["milestone-parent"],
    });
  }

  const maxDepth = await getMaxTaskDepth(projectId, dbOrTx);
  if (parent.depth + 2 > maxDepth) {
    throw new HTTPException(400, { message: REJECTION_MESSAGES["too-deep"] });
  }

  return parent;
}

export async function nextSiblingPosition(
  projectId: string,
  parentId: string | null,
  dbOrTx: DbOrTx = db,
): Promise<number> {
  const [row] = await dbOrTx
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
 * Reescribe la rama de `task` para que cuelgue de `parent`. La usan tanto el
 * reparentado interactivo como el importador, que tambien mueve tareas y no
 * puede permitirse una segunda copia del `substring`: es la sentencia que ya
 * fallo una vez por no llevar el `::int`.
 *
 * Da por hecho que quien llama tiene el cerrojo del proyecto y ha releido
 * `task` dentro de la transaccion.
 */
export async function moveSubtree(
  tx: DbOrTx,
  task: TaskNode,
  parent: TaskNode | null,
) {
  const oldPath = task.path;
  const newPath = parent ? childPath(parent.path, task.id) : rootPath(task.id);
  const depthDelta = (parent ? parent.depth + 1 : 0) - task.depth;
  const position = await nextSiblingPosition(
    task.projectId,
    parent?.id ?? null,
    tx,
  );

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
    // El predicado de `path` es redundante con el cerrojo y esta a proposito:
    // si alguien anade un escritor de arbol que no lo tome, esto convierte una
    // corrupcion silenciosa en cero filas afectadas y un 409.
    .where(and(eq(taskTable.id, task.id), eq(taskTable.path, newPath)))
    .returning();

  if (!updated) {
    throw new HTTPException(409, {
      message: "The task tree changed while it was being reparented",
    });
  }

  return updated;
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
  const normalizedParentId = parentId?.trim() || null;

  // Solo para saber que proyecto bloquear. Todo lo demas se relee dentro.
  const { projectId } = await loadTask(taskId);

  const result = await db.transaction(async (tx) => {
    await lockProjectTree(tx, projectId);

    // Releido ya con el cerrojo: validar contra una foto tomada antes es lo
    // que dejaba pasar los dos reparentados cruzados que forman un ciclo, y lo
    // que dejaba `parent_id` y `path` apuntando a sitios distintos cuando el
    // ancestro se movia por debajo. Ver `lockProjectTree`.
    const task = await loadTask(taskId, tx);

    if (task.projectId !== projectId) {
      throw new HTTPException(409, {
        message: "The task changed project while it was being reparented",
      });
    }

    if (normalizedParentId === task.parentId) {
      return { task, changed: false as const };
    }

    const parent = normalizedParentId
      ? await loadTask(normalizedParentId, tx)
      : null;

    const [maxDepth, subtreeHeight] = await Promise.all([
      getMaxTaskDepth(task.projectId, tx),
      getSubtreeHeight(task, tx),
    ]);

    const rejection = parent?.isMilestone
      ? "milestone-parent"
      : rejectReparent({ task, parent, subtreeHeight, maxDepth });

    if (rejection) {
      throw new HTTPException(400, { message: REJECTION_MESSAGES[rejection] });
    }

    const updated = await moveSubtree(tx, task, parent);

    return {
      task: updated,
      changed: true as const,
      oldParentId: task.parentId,
      newParentId: parent?.id ?? null,
      projectId: task.projectId,
    };
  });

  if (!result.changed) {
    return result.task;
  }

  await publishEvent("task.parent_changed", {
    taskId,
    projectId: result.projectId,
    userId: currentUserId,
    type: "parent_changed",
    oldParentId: result.oldParentId,
    newParentId: result.newParentId,
  });

  // Cambian dos ramas: la que la pierde y la que la gana (ADR 083).
  await scheduleAfter({
    projectId: result.projectId,
    taskIds: [taskId, result.oldParentId],
    actorId: currentUserId,
  });
  // La rama vieja pierde lo que la nueva gana (ADR 090).
  await refreshFormulasAfter({
    projectId: result.projectId,
    taskIds: [taskId, result.oldParentId],
  });

  return result.task;
}

export default updateTaskParent;
