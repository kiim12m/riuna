import { createId } from "@paralleldrive/cuid2";

// El arbol de tareas se guarda con `parent_id` como verdad y `path`/`depth`
// como forma materializada. `path` incluye la propia tarea y va entre barras
// —`/raiz/hija/nieta/`—, que es lo que permite tres cosas en una sola
// comparacion de prefijo: el subarbol de X, si Y desciende de X, y reescribir
// una rama entera al moverla.
//
// Las dos invariantes las vigila la base de datos con sendos CHECK
// (`task_path_ends_with_id`, `task_depth_matches_path`), no la disciplina de
// quien anada el proximo `insert(taskTable)`.

export const TASK_PATH_SEPARATOR = "/";

// Mas alla de este limite la interfaz deja de ser manejable: cada nivel come
// sangria y el arbol se vuelve una columna de guiones. Es configurable por
// proyecto (`project.max_task_depth`); esto es solo el techo del ajuste.
export const MAX_CONFIGURABLE_TASK_DEPTH = 10;
export const DEFAULT_MAX_TASK_DEPTH = 5;

export type TreeFields = {
  id: string;
  parentId: string | null;
  path: string;
  depth: number;
};

export type TreeNode = {
  id: string;
  path: string;
  depth: number;
};

/** Camino de una tarea raiz: `/id/`. */
export function rootPath(id: string): string {
  return `/${id}/`;
}

/** Camino de una hija: el del padre mas su propio identificador. */
export function childPath(parentPath: string, id: string): string {
  return `${parentPath}${id}/`;
}

/**
 * Valores de arbol para una tarea nueva sin padre. Genera el identificador
 * aqui a proposito: `path` lo necesita, y dejarlo al `$defaultFn` de la
 * columna lo haria inaccesible en el momento del insert.
 */
export function rootTaskTreeFields(): TreeFields {
  const id = createId();
  return { id, parentId: null, path: rootPath(id), depth: 0 };
}

/** Valores de arbol para una tarea nueva colgada de `parent`. */
export function childTaskTreeFields(parent: TreeNode): TreeFields {
  const id = createId();
  return {
    id,
    parentId: parent.id,
    path: childPath(parent.path, id),
    depth: parent.depth + 1,
  };
}

/** Patron `LIKE` que casa la tarea y todos sus descendientes. */
export function subtreePattern(path: string): string {
  return `${path}%`;
}

/** Patron `LIKE` que casa solo los descendientes, no la propia tarea. */
export function descendantsPattern(path: string): string {
  return `${path}_%`;
}

/** Cierto si `candidate` esta dentro del subarbol de `ancestor`, incluido el. */
export function isInSubtree(candidatePath: string, ancestorPath: string) {
  return candidatePath.startsWith(ancestorPath);
}

/** Identificadores de los ancestros, de la raiz hacia abajo, sin la propia. */
export function ancestorIds(path: string): string[] {
  const segments = path.split(TASK_PATH_SEPARATOR).filter(Boolean);
  return segments.slice(0, -1);
}

/** Reescribe el camino de un descendiente al mover su rama. */
export function rebasePath(
  descendantPath: string,
  oldPrefix: string,
  newPrefix: string,
): string {
  if (!descendantPath.startsWith(oldPrefix)) {
    throw new Error("Path is not inside the moved subtree");
  }
  return newPrefix + descendantPath.slice(oldPrefix.length);
}

export function depthFromPath(path: string): number {
  return path.split(TASK_PATH_SEPARATOR).filter(Boolean).length - 1;
}

export type ReparentRejection =
  | "self"
  | "cycle"
  | "cross-project"
  | "too-deep"
  | null;

/**
 * Unica autoridad sobre si un reparentado es legal. Es pura para que las
 * pruebas puedan recorrer los casos raros —moverse bajo un nieto, colgar una
 * rama alta de una hoja profunda— sin base de datos delante.
 *
 * `subtreeHeight` es cuantos niveles cuelgan por debajo de la tarea movida:
 * 0 si es una hoja. Sin el, mover una rama de tres niveles bajo un padre que
 * ya esta en el limite pasaria la validacion y dejaria descendientes fuera.
 */
export function rejectReparent({
  task,
  parent,
  subtreeHeight,
  maxDepth,
}: {
  task: TreeNode & { projectId: string };
  parent: (TreeNode & { projectId: string }) | null;
  subtreeHeight: number;
  maxDepth: number;
}): ReparentRejection {
  if (!parent) {
    return subtreeHeight + 1 > maxDepth ? "too-deep" : null;
  }

  if (parent.id === task.id) {
    return "self";
  }

  if (parent.projectId !== task.projectId) {
    return "cross-project";
  }

  if (isInSubtree(parent.path, task.path)) {
    return "cycle";
  }

  // Niveles ocupados tras el movimiento, contando desde 1: el padre, la tarea
  // y todo lo que cuelgue de ella.
  if (parent.depth + 1 + subtreeHeight + 1 > maxDepth) {
    return "too-deep";
  }

  return null;
}
