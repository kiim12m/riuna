import { eq, inArray } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { taskTable } from "../database/schema";
import type { DbOrTx } from "../task/controllers/assignees";
import { hasChildren } from "../task/schedule/children";
import { loadPrecedences } from "../task/schedule/reschedule";

/**
 * Lo que tiene que cumplir `source` precede a `target` (ADR 084), ya con el
 * cerrojo del proyecto tomado para que dos relaciones a la vez no cierren un
 * ciclo cada una por su lado.
 */
export async function assertCanPrecede(
  tx: DbOrTx,
  sourceId: string,
  targetId: string,
) {
  const rows = await tx
    .select({
      id: taskTable.id,
      projectId: taskTable.projectId,
      path: taskTable.path,
    })
    .from(taskTable)
    .where(inArray(taskTable.id, [sourceId, targetId]));
  const source = rows.find((row) => row.id === sourceId);
  const target = rows.find((row) => row.id === targetId);
  if (!source || !target) {
    throw new HTTPException(404, { message: "Task not found" });
  }

  // Se planifica bajo el cerrojo de un proyecto: cruzar proyectos pediria dos.
  if (source.projectId !== target.projectId) {
    throw new HTTPException(400, {
      message: "A task can only precede another task of the same project",
    });
  }
  // Un resumen toma sus fechas de las subtareas: la relacion va en ellas.
  if (await hasChildren(targetId, tx)) {
    throw new HTTPException(400, {
      message:
        "A task with subtasks takes its dates from them: make one of its subtasks follow instead",
    });
  }
  // Una rama y su padre se arrastran mutuamente: nunca acabaria.
  if (
    target.path.includes(`/${sourceId}/`) ||
    source.path.includes(`/${targetId}/`)
  ) {
    throw new HTTPException(400, {
      message: "A task cannot precede or follow a task of its own branch",
    });
  }

  // El ciclo: si desde la sucesora se llega a la predecesora siguiendo lo que
  // arrastra la planificacion —de una predecesora a sus sucesoras, y de una
  // hija a su padre—, la relacion nueva cerraria la vuelta.
  const [tasks, precedences] = await Promise.all([
    tx
      .select({ id: taskTable.id, parentId: taskTable.parentId })
      .from(taskTable)
      .where(eq(taskTable.projectId, source.projectId)),
    loadPrecedences(tx, source.projectId),
  ]);
  const parentOf = new Map(tasks.map((task) => [task.id, task.parentId]));
  const successorsOf = new Map<string, string[]>();
  for (const precedence of precedences) {
    const list = successorsOf.get(precedence.predecessorId) ?? [];
    list.push(precedence.successorId);
    successorsOf.set(precedence.predecessorId, list);
  }
  const seen = new Set<string>();
  const stack = [targetId];
  while (stack.length > 0) {
    const id = stack.pop() as string;
    if (id === sourceId) {
      throw new HTTPException(409, {
        message: "This relation would close a loop in the schedule",
      });
    }
    if (seen.has(id)) continue;
    seen.add(id);
    const parent = parentOf.get(id);
    if (parent) stack.push(parent);
    stack.push(...(successorsOf.get(id) ?? []));
  }

  return { projectId: source.projectId };
}
