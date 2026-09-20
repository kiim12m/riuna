import { and, eq, inArray, like, ne } from "drizzle-orm";
import db from "../../database";
import { columnTable, projectTable, taskTable } from "../../database/schema";
import { publishEvent } from "../../events";
import { descendantsPattern } from "../tree";
import { lockProjectTree } from "./lock-project-tree";

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
 * Propaga el estado de varias tareas del mismo proyecto a sus subarboles.
 * Devuelve cuantos descendientes ha movido en total.
 *
 * El lote comparte las comprobaciones, la transaccion y el cerrojo: un cambio
 * masivo con la cascada apagada cuesta dos consultas en vez de dos por tarea, y
 * con ella encendida toma el cerrojo del arbol una vez en vez de una por tarea.
 */
export async function cascadeStatusToSubtrees({
  tasks,
  projectId,
  status,
  currentUserId,
}: {
  tasks: { id: string; path: string }[];
  projectId: string;
  status: string;
  currentUserId: string | undefined;
}): Promise<number> {
  if (tasks.length === 0) return 0;

  const reason = await classifyStatus(projectId, status);
  if (!reason) return 0;

  if (!(await shouldCascade(projectId, reason))) return 0;

  const [column] = await db
    .select({ id: columnTable.id })
    .from(columnTable)
    .where(
      and(eq(columnTable.projectId, projectId), eq(columnTable.slug, status)),
    )
    .limit(1);

  // Cerrar no saca del archivo. Archivar si alcanza a las cerradas —bajar al
  // archivo es la direccion correcta—, pero cerrar un padre no puede resucitar
  // una rama archivada hace meses: reaparece en el tablero, vuelve a todos los
  // agregados, y el estado anterior ya no se puede recuperar.
  const scopeOf = (path: string) =>
    and(
      eq(taskTable.projectId, projectId),
      like(taskTable.path, descendantsPattern(path)),
      ne(taskTable.status, status),
      ...(reason === "close" ? [ne(taskTable.status, "archived")] : []),
    );

  // De la mas alta a la mas honda, para que una descendiente alcanzable desde
  // dos seleccionadas se atribuya siempre a la misma: la de arriba.
  const roots = [...tasks].sort((a, b) => a.path.length - b.path.length);

  // Lectura y escritura en la misma transaccion, con el cerrojo del arbol que
  // toman mover y reparentar, y las filas bloqueadas: si otra peticion cambiaba
  // una descendiente entre las dos, la escritura se la saltaba pero la
  // actividad seguia contando un cambio que no habia hecho.
  const moved = await db.transaction(async (tx) => {
    await lockProjectTree(tx, projectId);

    const found: { id: string; oldStatus: string; from: string }[] = [];
    const seen = new Set<string>();

    // Un escaneo por rama, cada uno con su prefijo unico: `task_path_idx`
    // (`text_pattern_ops`) sirve `LIKE '/a/b/%'`, y un `LIKE ANY` sobre 500
    // patrones perderia el indice.
    for (const root of roots) {
      // Se leen antes de escribir porque `RETURNING` devolveria ya el estado
      // nuevo, y la actividad necesita decir de donde venia cada tarea.
      const rows = await tx
        .select({ id: taskTable.id, oldStatus: taskTable.status })
        .from(taskTable)
        .where(scopeOf(root.path))
        .for("update");

      for (const row of rows) {
        if (seen.has(row.id)) continue;
        seen.add(row.id);
        found.push({ ...row, from: root.id });
      }
    }

    if (found.length > 0) {
      await tx
        .update(taskTable)
        .set({ status, columnId: column?.id ?? null })
        .where(
          inArray(
            taskTable.id,
            found.map((row) => row.id),
          ),
        );
    }

    return found;
  });

  for (const descendant of moved) {
    await publishEvent("task.status_changed", {
      taskId: descendant.id,
      projectId,
      userId: currentUserId,
      oldStatus: descendant.oldStatus,
      newStatus: status,
      type: "status_changed",
      cascadedFrom: descendant.from,
    });
  }

  return moved.length;
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
  return cascadeStatusToSubtrees({
    tasks: [task],
    projectId: task.projectId,
    status,
    currentUserId,
  });
}
