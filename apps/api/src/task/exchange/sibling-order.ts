import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import type db from "../../database";
import { taskTable } from "../../database/schema";
import type { TreeNode } from "../tree";
import type { OutlineResolution } from "./outline";

// Reordena las hermanas segun el orden en que aparecen en el fichero.
//
// La cautela que lo hace seguro: solo se toca un grupo de hermanas si el
// fichero lo trae **entero** —toda hija que el proyecto ya tiene aparece en el
// fichero—. Reordenar medio grupo entrelazaria el orden viejo con el nuevo, que
// es peor que dejarlo quieto. Es la misma prudencia que la regla 3 del esquema
// (ADR 017): si el fichero esta incompleto, no se mueve nada.
//
// `position` es la columna que comparten el arbol y el tablero (ADR 011), asi
// que reordenar hermanas reordena tambien esa columna del tablero. Es conocido
// y aceptado; no hay una segunda columna que gastar.

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Clave del grupo de las raices. El `:` la separa de cualquier id de tarea
// (cuid2 es [a-z0-9]{24}), asi que `parent_id IS NULL` tiene su propia entrada
// en los Map sin arriesgar una colision.
const ROOT_KEY = "root:group";

export type SiblingOrderPlan = {
  /** Filas que reciben una `position` nueva, en orden de aparicion en el fichero. */
  positionByRowIndex: Map<number, number>;
  /** Grupos que se dejan como estan porque el fichero no traia todas las hermanas. */
  skippedIncompleteGroups: number;
};

const noPlan = (): SiblingOrderPlan => ({
  positionByRowIndex: new Map(),
  skippedIncompleteGroups: 0,
});

type PlacedRow = {
  /** Fila de datos en el fichero, base 0. */
  rowIndex: number;
  /** Tarea resultante (alta o actualizacion). */
  taskId: string;
  /** El esquema de la fila estaba vacio: no dice nada del orden. */
  blankOutline: boolean;
};

export async function planSiblingOrder(
  tx: Tx,
  projectId: string,
  basePosition: number,
  /** Todas las filas colocadas, ya en orden de fichero. */
  placedRows: readonly PlacedRow[],
  resolutionByIndex: ReadonlyMap<number, OutlineResolution>,
  nodeByRow: ReadonlyMap<number, TreeNode>,
): Promise<SiblingOrderPlan> {
  // 1. Agrupa las filas por su padre resuelto, conservando el orden de fichero.
  const groups = new Map<
    string,
    { parentTaskId: string | null; rows: PlacedRow[] }
  >();

  for (const row of placedRows) {
    const resolution = resolutionByIndex.get(row.rowIndex);
    // Sin esquema utilizable (`parentMissing`, o celda vacia) el fichero no
    // afirma nada sobre el orden de esta fila: se queda donde esta.
    if (!resolution || resolution.parentMissing || row.blankOutline) {
      continue;
    }

    let key: string;
    let parentTaskId: string | null;

    if (resolution.parentIndex === null) {
      key = ROOT_KEY;
      parentTaskId = null;
    } else {
      const parentNode = nodeByRow.get(resolution.parentIndex);
      if (!parentNode) continue; // el padre no se pudo colocar
      key = parentNode.id;
      parentTaskId = parentNode.id;
    }

    const group = groups.get(key) ?? { parentTaskId, rows: [] };
    group.rows.push(row);
    groups.set(key, group);
  }

  if (groups.size === 0) {
    return noPlan();
  }

  // 2. Que hijas tiene ya el proyecto para cada padre de un grupo. Una fila
  //    nueva todavia no esta aqui, y no pasa nada: no cuenta contra la
  //    completitud del grupo.
  const parentIds = [...groups.values()]
    .map((group) => group.parentTaskId)
    .filter((id): id is string => id !== null);

  const wantsRoots = groups.has(ROOT_KEY);
  const parentFilter = parentIds.length
    ? inArray(taskTable.parentId, parentIds)
    : sql`false`;

  const dbChildren = await tx
    .select({ id: taskTable.id, parentId: taskTable.parentId })
    .from(taskTable)
    .where(
      and(
        eq(taskTable.projectId, projectId),
        wantsRoots
          ? or(isNull(taskTable.parentId), parentFilter)
          : parentFilter,
      ),
    );

  const dbChildIdsByKey = new Map<string, Set<string>>();
  for (const child of dbChildren) {
    const key = child.parentId ?? ROOT_KEY;
    const set = dbChildIdsByKey.get(key) ?? new Set<string>();
    set.add(child.id);
    dbChildIdsByKey.set(key, set);
  }

  // 3. Un contador unico, en orden de fichero, para todos los grupos completos.
  //    Los deja como un bloque contiguo detras de lo que el proyecto ya tenia.
  const completeKeys = new Set<string>();
  let skippedIncompleteGroups = 0;
  for (const [key, group] of groups) {
    const importedIds = new Set(group.rows.map((row) => row.taskId));
    const dbIds = dbChildIdsByKey.get(key) ?? new Set<string>();
    const complete = [...dbIds].every((id) => importedIds.has(id));

    if (complete) {
      completeKeys.add(key);
    } else {
      skippedIncompleteGroups += 1;
    }
  }

  // El recorrido vuelve a ser por `placedRows` para que el orden entre grupos
  // sea tambien el del fichero, no el de insercion en el Map.
  const positionByRowIndex = new Map<number, number>();
  let nextPosition = basePosition;
  for (const row of placedRows) {
    const resolution = resolutionByIndex.get(row.rowIndex);
    if (!resolution || resolution.parentMissing || row.blankOutline) continue;

    const key =
      resolution.parentIndex === null
        ? ROOT_KEY
        : nodeByRow.get(resolution.parentIndex)?.id;

    if (key && completeKeys.has(key)) {
      positionByRowIndex.set(row.rowIndex, nextPosition);
      nextPosition += 1;
    }
  }

  return { positionByRowIndex, skippedIncompleteGroups };
}
