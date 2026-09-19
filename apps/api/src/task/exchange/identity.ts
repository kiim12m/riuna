import { and, eq, inArray, isNull, max } from "drizzle-orm";
import type db from "../../database";
import { epicTable, taskTable } from "../../database/schema";
import { resolveExternalRefs } from "../../external-ref";
import {
  getSubtreeHeight,
  moveSubtree,
  type TaskNode,
} from "../controllers/update-task-parent";
import { rejectReparent, type TreeNode } from "../tree";
import { type ImportLookups, normalizeLookupKey } from "./lookups";
import type { MappedRow } from "./map-rows";

// Lo que hay que resolver contra la base antes de escribir: que fila del
// fichero corresponde a que tarea, que epicas hay que crear, y donde queda cada
// tarea que ya existia dentro del arbol.

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * De fila del fichero a tarea existente. Dos vias, en este orden:
 *
 *  1. La columna `ID`, que el export rellena. Es lo que hace idempotente el
 *     viaje Riuna -> Excel -> Riuna sin configurar nada.
 *  2. La columna `Referencia` contra `external_ref`, bajo el nombre de origen
 *     de esta importacion. Es lo que hace idempotente un fichero ajeno.
 *
 * Un `ID` que no existe, o que es de otro proyecto, **no** casa: la fila se
 * trata como nueva. Escribir sobre una tarea de otro proyecto porque alguien
 * pego un identificador es peor que crear una de mas.
 */
export type ExistingTask = TaskNode & { userId: string | null };

export async function resolveIdentity(
  tx: Tx,
  projectId: string,
  workspaceId: string,
  source: string,
  rows: readonly MappedRow[],
): Promise<Map<number, ExistingTask>> {
  const byRow = new Map<number, ExistingTask>();

  const directIds = [
    ...new Set(
      rows.map((row) => row.id).filter((id): id is string => Boolean(id)),
    ),
  ];

  const references = [
    ...new Set(
      rows
        .filter((row) => !row.id && row.reference)
        .map((row) => row.reference as string),
    ),
  ];

  const referenceToTask = references.length
    ? await resolveExternalRefs(workspaceId, source, "task", references, tx)
    : new Map<string, string>();

  const wanted = [...new Set([...directIds, ...referenceToTask.values()])];
  if (wanted.length === 0) {
    return byRow;
  }

  const found = await tx
    .select({
      id: taskTable.id,
      projectId: taskTable.projectId,
      parentId: taskTable.parentId,
      path: taskTable.path,
      depth: taskTable.depth,
      // El responsable actual: sin el, un fichero que mapee `Asignados` y no
      // `Responsable` dejaria `assignee_id` fuera de `task_assignee`, que es la
      // divergencia que prohibe la ADR 010.
      userId: taskTable.userId,
    })
    .from(taskTable)
    .where(
      and(inArray(taskTable.id, wanted), eq(taskTable.projectId, projectId)),
    );

  const byId = new Map(found.map((task) => [task.id, task]));

  for (const row of rows) {
    const id =
      row.id ??
      (row.reference ? referenceToTask.get(row.reference) : undefined);
    if (!id) continue;

    const task = byId.get(id);
    if (task) {
      byRow.set(row.index, task);
    }
  }

  return byRow;
}

/**
 * Deja creadas las epicas que el fichero nombra y no existen. Va dentro de la
 * transaccion y bajo el cerrojo del proyecto, que es lo que hace innecesario un
 * indice unico sobre `(project_id, name)`: dos importaciones del mismo proyecto
 * no corren a la vez.
 */
export async function ensureEpics(
  tx: Tx,
  projectId: string,
  rows: readonly MappedRow[],
  lookups: ImportLookups,
): Promise<Map<string, string>> {
  const byName = new Map(lookups.epicByName);

  const wanted = new Map<string, string>();
  for (const row of rows) {
    for (const name of row.epics) {
      const key = normalizeLookupKey(name);
      if (key && !byName.has(key) && !wanted.has(key)) {
        wanted.set(key, name);
      }
    }
  }

  if (wanted.size === 0) {
    return byName;
  }

  const [row] = await tx
    .select({ maxPosition: max(epicTable.position) })
    .from(epicTable)
    .where(
      and(eq(epicTable.projectId, projectId), isNull(epicTable.archivedAt)),
    );

  let position = (row?.maxPosition ?? 0) + 1;

  const created = await tx
    .insert(epicTable)
    .values(
      [...wanted].map(([, name]) => ({
        projectId,
        name,
        position: position++,
      })),
    )
    .returning({ id: epicTable.id, name: epicTable.name });

  for (const epic of created) {
    byName.set(normalizeLookupKey(epic.name), epic.id);
  }

  return byName;
}

/** La siguiente posicion libre del proyecto, para respetar el orden del fichero. */
export async function nextProjectPosition(
  tx: Tx,
  projectId: string,
): Promise<number> {
  const [row] = await tx
    .select({ maxPosition: max(taskTable.position) })
    .from(taskTable)
    .where(eq(taskTable.projectId, projectId));

  return (row?.maxPosition ?? 0) + 1;
}

export type PlacementInput = {
  existing: TaskNode;
  parentNode: TreeNode | null;
  outlineMapped: boolean;
  blankOutline: boolean;
  parentMissing: boolean;
  maxDepth: number;
  warnings: string[];
};

/**
 * Donde queda en el arbol una tarea que ya existia.
 *
 * Tres casos, y ninguno mueve nada en silencio:
 *
 *  - El fichero no trae la columna `Esquema`, o la celda esta vacia: no se
 *    toca. Una hoja plana no puede promover a raiz el proyecto entero.
 *  - El esquema nombra un padre que no esta en el fichero: se conserva el que
 *    tiene y se avisa. Es lo que hace segura la reimportacion de una vista
 *    filtrada, que por definicion trae arboles incompletos.
 *  - El esquema nombra un padre presente, o dice que es raiz: se mueve la rama.
 */
export async function placeExistingTask(
  tx: Tx,
  input: PlacementInput,
): Promise<TreeNode> {
  const { existing, parentNode, maxDepth, warnings } = input;
  const current: TreeNode = {
    id: existing.id,
    path: existing.path,
    depth: existing.depth,
  };

  if (!input.outlineMapped || input.blankOutline) {
    return current;
  }

  if (input.parentMissing) {
    warnings.push(
      "The outline names a parent that is not in the file; the task kept its current parent",
    );
    return current;
  }

  const targetParentId = parentNode?.id ?? null;
  if (targetParentId === existing.parentId) {
    return current;
  }

  const parent: TaskNode | null = parentNode
    ? {
        id: parentNode.id,
        projectId: existing.projectId,
        parentId: null,
        path: parentNode.path,
        depth: parentNode.depth,
      }
    : null;

  const subtreeHeight = await getSubtreeHeight(existing, tx);
  const rejection = rejectReparent({
    task: existing,
    parent,
    subtreeHeight,
    maxDepth,
  });

  if (rejection) {
    warnings.push(
      `The task could not be moved in the tree (${rejection}); it kept its current parent`,
    );
    return current;
  }

  const moved = await moveSubtree(tx, existing, parent);
  return { id: moved.id, path: moved.path, depth: moved.depth };
}
