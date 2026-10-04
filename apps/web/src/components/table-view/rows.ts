import type Task from "@/types/task";

// Una fila de la tabla es una tarea mas sus hijas, que TanStack Table sabe
// plegar por su cuenta: es la razon por la que el plan eligio esta libreria
// —sub-filas nativas— sobre escribir el arbol a mano por tercera vez.
//
// `rowKey` solo existe al agrupar por epica: una tarea con dos epicas sale en
// dos grupos, y cada fila necesita un identificador propio (el plegado y la
// edicion se atan al identificador, no a la tarea).
export type TableRow = Task & { subRows: TableRow[]; rowKey?: string };

/**
 * Reconstruye el arbol desde la lista plana. El servidor manda `parentId` ya
 * calculado, asi que esto es un agrupado y no un recorrido recursivo.
 *
 * Una tarea cuyo padre no este en la lista —porque un filtro lo dejo fuera— se
 * trata como raiz, para que no desaparezca de la vista con el.
 */
export function buildRows(tasks: Task[]): TableRow[] {
  const byId = new Map<string, TableRow>();

  for (const task of tasks) {
    byId.set(task.id, { ...task, subRows: [] });
  }

  const roots: TableRow[] = [];

  for (const row of byId.values()) {
    const parent = row.parentId ? byId.get(row.parentId) : undefined;
    if (parent) {
      parent.subRows.push(row);
    } else {
      roots.push(row);
    }
  }

  const sortByPosition = (rows: TableRow[]) => {
    rows.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    for (const row of rows) sortByPosition(row.subRows);
  };

  sortByPosition(roots);

  return roots;
}

export type EpicGroup = {
  /** `epic:<id>`, o `none` para lo que no tiene epica. */
  key: string;
  epic: { id: string; name: string; color: string | null } | null;
  rows: TableRow[];
};

function withKey(row: TableRow, groupKey: string): TableRow {
  return {
    ...row,
    rowKey: `${row.id}@${groupKey}`,
    subRows: row.subRows.map((child) => withKey(child, groupKey)),
  };
}

/**
 * Reparte las filas de primer nivel por epica. Una tarea con varias sale en
 * cada una de ellas —una epica es transversal, no un cajon— y las que no tienen
 * ninguna van al final, en su propio grupo. Las hijas van con su madre, sean
 * cuales sean sus epicas: la rama no se parte.
 *
 * Los grupos salen por nombre de epica, no por el orden en que se encontraron:
 * que la tabla no cambie de sitio los grupos al editar una tarea.
 */
export function groupByEpic(rows: TableRow[]): EpicGroup[] {
  const groups = new Map<string, EpicGroup>();

  for (const row of rows) {
    const epics = row.epics ?? [];
    const keys =
      epics.length > 0
        ? epics.map((epic) => ({ key: `epic:${epic.id}`, epic }))
        : [{ key: "none", epic: null }];

    for (const { key, epic } of keys) {
      let group = groups.get(key);
      if (!group) {
        group = { key, epic, rows: [] };
        groups.set(key, group);
      }
      group.rows.push(withKey(row, key));
    }
  }

  return [...groups.values()].sort((a, b) => {
    if (!a.epic) return 1;
    if (!b.epic) return -1;
    return a.epic.name.localeCompare(b.epic.name);
  });
}

/** El identificador de una fila para la tabla: el de la tarea, o el del grupo. */
export function rowIdOf(row: TableRow) {
  return row.rowKey ?? row.id;
}
