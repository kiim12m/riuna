import { and, eq, like, ne } from "drizzle-orm";
import db from "../../database";
import { columnTable, projectTable, taskTable } from "../../database/schema";
import { publishEvent } from "../../events";
import { descendantsPattern } from "../tree";

// La cascada baja por la rama, nunca sube. Cerrar un padre puede cerrar lo que
// cuelga de el; cerrar una hija no toca al padre, que es lo que el agregado de
// progreso ya cuenta sin necesidad de escribir nada.
//
// Viene apagada por proyecto (`cascade_close`, `cascade_archive`). Es una
// accion que multiplica un clic por el tamano de la rama, y multiplicar sin
// que nadie lo haya pedido es la clase de sorpresa que hace desconfiar de una
// herramienta.

type CascadeReason = "close" | "archive";

async function shouldCascade(
  projectId: string,
  reason: CascadeReason,
): Promise<boolean> {
  const [project] = await db
    .select({
      cascadeClose: projectTable.cascadeClose,
      cascadeArchive: projectTable.cascadeArchive,
    })
    .from(projectTable)
    .where(eq(projectTable.id, projectId))
    .limit(1);

  if (!project) return false;

  return reason === "archive" ? project.cascadeArchive : project.cascadeClose;
}

/**
 * Que clase de cascada dispara un estado, si es que dispara alguna. Solo
 * cerrar —llegar a una columna final— y archivar se propagan: mover una tarea
 * a "en curso" no dice nada sobre sus hijas.
 */
async function classifyStatus(
  projectId: string,
  status: string,
): Promise<CascadeReason | null> {
  if (status === "archived") return "archive";

  const [column] = await db
    .select({ isFinal: columnTable.isFinal })
    .from(columnTable)
    .where(
      and(eq(columnTable.projectId, projectId), eq(columnTable.slug, status)),
    )
    .limit(1);

  return column?.isFinal ? "close" : null;
}

/**
 * Propaga el estado de una tarea a todo su subarbol. Devuelve cuantos
 * descendientes ha movido, que es lo que la interfaz necesita para decirlo.
 */
export async function cascadeStatusToSubtree({
  task,
  status,
  currentUserId,
}: {
  task: { id: string; projectId: string; path: string };
  status: string;
  currentUserId: string | undefined;
}): Promise<number> {
  const reason = await classifyStatus(task.projectId, status);
  if (!reason) return 0;

  if (!(await shouldCascade(task.projectId, reason))) return 0;

  const [column] = await db
    .select({ id: columnTable.id })
    .from(columnTable)
    .where(
      and(
        eq(columnTable.projectId, task.projectId),
        eq(columnTable.slug, status),
      ),
    )
    .limit(1);

  // Cerrar no saca del archivo. Archivar si alcanza a las cerradas —bajar al
  // archivo es la direccion correcta—, pero cerrar un padre no puede resucitar
  // una rama archivada hace meses: reaparece en el tablero, vuelve a todos los
  // agregados, y el estado anterior ya no se puede recuperar.
  const scope = and(
    eq(taskTable.projectId, task.projectId),
    like(taskTable.path, descendantsPattern(task.path)),
    ne(taskTable.status, status),
    ...(reason === "close" ? [ne(taskTable.status, "archived")] : []),
  );

  // Se leen antes de escribir porque `RETURNING` devolveria ya el estado
  // nuevo, y la actividad necesita decir de donde venia cada tarea.
  const moved = await db
    .select({ id: taskTable.id, oldStatus: taskTable.status })
    .from(taskTable)
    .where(scope);

  if (moved.length === 0) return 0;

  await db
    .update(taskTable)
    .set({ status, columnId: column?.id ?? null })
    .where(scope);

  for (const descendant of moved) {
    await publishEvent("task.status_changed", {
      taskId: descendant.id,
      projectId: task.projectId,
      userId: currentUserId,
      oldStatus: descendant.oldStatus,
      newStatus: status,
      type: "status_changed",
      cascadedFrom: task.id,
    });
  }

  return moved.length;
}
