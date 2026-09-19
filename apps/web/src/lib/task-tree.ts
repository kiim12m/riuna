import type Task from "@/types/task";

// El servidor manda `parentId`, `path` y `depth` ya calculados. Aqui solo se
// arma la forma visible: quien cuelga de quien, en que orden, y que se ve con
// las ramas que haya plegadas.

export type TaskTreeNode = {
  task: Task;
  /** Profundidad dentro de lo que la vista esta enseñando, no la del arbol. */
  depth: number;
  children: TaskTreeNode[];
};

export type VisibleTaskRow = {
  task: Task;
  depth: number;
  hasChildren: boolean;
  isCollapsed: boolean;
};

function comparePosition(a: Task, b: Task) {
  const byPosition = (a.position ?? 0) - (b.position ?? 0);
  if (byPosition !== 0) return byPosition;
  return (a.number ?? 0) - (b.number ?? 0);
}

/**
 * Arma el bosque de las tareas dadas. Una tarea cuyo padre no esta en la lista
 * —porque esta filtrado, archivado o en otra seccion— se dibuja como raiz: es
 * preferible a hacerla desaparecer por no poder colgarla de nada.
 */
export function buildTaskTree(tasks: Task[]): TaskTreeNode[] {
  const nodes = new Map<string, TaskTreeNode>();

  for (const task of tasks) {
    nodes.set(task.id, { task, depth: 0, children: [] });
  }

  const roots: TaskTreeNode[] = [];

  for (const node of nodes.values()) {
    const parentId = node.task.parentId;
    const parent = parentId ? nodes.get(parentId) : undefined;

    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const assignDepth = (node: TaskTreeNode, depth: number) => {
    node.depth = depth;
    node.children.sort((a, b) => comparePosition(a.task, b.task));
    for (const child of node.children) {
      assignDepth(child, depth + 1);
    }
  };

  roots.sort((a, b) => comparePosition(a.task, b.task));
  for (const root of roots) {
    assignDepth(root, 0);
  }

  // Un ciclo no tiene raiz: si `A` cuelga de `B` y `B` de `A`, los dos
  // encuentran padre y ninguno entra en `roots`, asi que la rama entera
  // desaparecia de la vista —sin error, sin hueco, sin aviso— y el proyecto
  // parecia tener menos tareas de las que tiene.
  //
  // No deberia pasar: la base lo impide con `lockProjectTree` y las dos CHECK.
  // Pero el propio repositorio sabe que es un estado alcanzable —la migracion
  // 0048 dedica un WITH RECURSIVE a romper ciclos heredados— y perder filas en
  // silencio es la peor forma de reaccionar. Se promueven a raiz.
  const reachable = new Set<string>();
  const markReachable = (node: TaskTreeNode) => {
    if (reachable.has(node.task.id)) return;
    reachable.add(node.task.id);
    for (const child of node.children) markReachable(child);
  };
  for (const root of roots) markReachable(root);

  if (reachable.size < nodes.size) {
    for (const node of nodes.values()) {
      if (reachable.has(node.task.id)) continue;
      // Se corta el ciclo por aqui: deja de colgar de nadie y pasa a raiz.
      const parent = node.task.parentId
        ? nodes.get(node.task.parentId)
        : undefined;
      if (parent) {
        parent.children = parent.children.filter((child) => child !== node);
      }
      roots.push(node);
      assignDepth(node, 0);
      markReachable(node);
    }

    roots.sort((a, b) => comparePosition(a.task, b.task));
  }

  return roots;
}

/** Recorre el bosque en el orden en que se dibuja, saltando lo plegado. */
export function flattenVisibleRows(
  roots: TaskTreeNode[],
  collapsedIds: ReadonlySet<string>,
): VisibleTaskRow[] {
  const rows: VisibleTaskRow[] = [];

  const walk = (node: TaskTreeNode) => {
    const hasChildren = node.children.length > 0;
    const isCollapsed = hasChildren && collapsedIds.has(node.task.id);

    rows.push({ task: node.task, depth: node.depth, hasChildren, isCollapsed });

    if (hasChildren && !isCollapsed) {
      for (const child of node.children) {
        walk(child);
      }
    }
  };

  for (const root of roots) {
    walk(root);
  }

  return rows;
}

/**
 * Sangrar (`Tab`): la tarea pasa a colgar del hermano que tiene justo encima.
 * Sin hermano anterior no hay de quien colgarla, que es exactamente lo que
 * hace un editor de listas.
 */
export function indentTarget(
  rows: VisibleTaskRow[],
  taskId: string,
): string | null {
  const index = rows.findIndex((row) => row.task.id === taskId);
  if (index <= 0) return null;

  const row = rows[index];
  if (!row) return null;

  for (let i = index - 1; i >= 0; i -= 1) {
    const candidate = rows[i];
    if (!candidate) continue;
    if (candidate.depth === row.depth) return candidate.task.id;
    if (candidate.depth < row.depth) return null;
  }

  return null;
}

/**
 * Promover (`Shift+Tab`): la tarea pasa a ser hermana de su padre. Devuelve
 * `undefined` cuando no hay nada que promover —ya es raiz—, y `null` cuando el
 * destino es la raiz del proyecto, que si es un cambio.
 */
export function outdentTarget(
  tasks: Map<string, Task>,
  taskId: string,
): string | null | undefined {
  const task = tasks.get(taskId);
  if (!task?.parentId) return undefined;

  const parent = tasks.get(task.parentId);
  return parent?.parentId ?? null;
}

/** Cierto si `candidateParentId` esta dentro del subarbol de `taskId`. */
export function wouldCreateCycle(
  tasks: Map<string, Task>,
  taskId: string,
  candidateParentId: string,
): boolean {
  if (taskId === candidateParentId) return true;

  let cursor = tasks.get(candidateParentId);
  const seen = new Set<string>();

  while (cursor?.parentId) {
    if (cursor.parentId === taskId) return true;
    if (seen.has(cursor.parentId)) return false;
    seen.add(cursor.parentId);
    cursor = tasks.get(cursor.parentId);
  }

  return false;
}
