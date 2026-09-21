import { and, asc, eq, inArray, isNull, type SQL, sql } from "drizzle-orm";
import db from "../database";
import {
  columnTable,
  labelTable,
  projectTable,
  taskAssigneeTable,
  taskTable,
  userTable,
} from "../database/schema";

/** El slug que Kaneo daba por terminado antes de que las columnas fueran configurables. */
export const LEGACY_FINAL_STATUS = "done";

export type ProjectColumn = {
  slug: string;
  name: string;
  icon: string | null;
  isFinal: boolean;
};

export type ProjectColumns = {
  columns: ProjectColumn[];
  /** Los estados que cuentan como terminados en **este** proyecto. */
  finals: string[];
};

/**
 * Las columnas de los proyectos vivos del espacio, con "hecho" ya resuelto.
 *
 * Una sola consulta que sirve para las **dos** cosas que necesitan la regla:
 * el predicado SQL que excluye lo terminado y la bandera `isDone` que decora
 * cada fila. Escribirla dos veces —una en SQL correlado y otra en JavaScript—
 * era pedir que divergieran; asi solo hay un `finals` por proyecto y las dos
 * lo leen.
 *
 * `getFinalStatuses` (`task/tree-aggregates.ts`) hace lo mismo para un unico
 * proyecto, incluido el respaldo al slug `done` heredado, pero es privada de su
 * modulo. El respaldo se reproduce aqui para que una instalacion heredada, sin
 * columnas marcadas como finales, siga viendo terminado lo que ya veia.
 */
export async function getWorkspaceColumns(
  workspaceId: string,
): Promise<Map<string, ProjectColumns>> {
  const rows = await db
    .select({
      projectId: projectTable.id,
      slug: columnTable.slug,
      name: columnTable.name,
      icon: columnTable.icon,
      isFinal: columnTable.isFinal,
    })
    .from(projectTable)
    .leftJoin(columnTable, eq(columnTable.projectId, projectTable.id))
    .where(
      and(
        eq(projectTable.workspaceId, workspaceId),
        isNull(projectTable.archivedAt),
      ),
    )
    .orderBy(asc(columnTable.position));

  const columnsByProject = new Map<string, ProjectColumn[]>();

  for (const row of rows) {
    const list = columnsByProject.get(row.projectId) ?? [];
    // El LEFT JOIN deja las columnas a null en un proyecto que no tiene
    // ninguna: la entrada existe igual, con la lista vacia, para que el
    // respaldo se le aplique.
    if (row.slug !== null) {
      list.push({
        slug: row.slug,
        name: row.name ?? row.slug,
        icon: row.icon,
        isFinal: row.isFinal ?? false,
      });
    }
    columnsByProject.set(row.projectId, list);
  }

  const result = new Map<string, ProjectColumns>();

  for (const [projectId, columns] of columnsByProject) {
    const finals = columns
      .filter((column) => column.isFinal)
      .map((column) => column.slug);

    result.set(projectId, {
      columns,
      finals: finals.length > 0 ? finals : [LEGACY_FINAL_STATUS],
    });
  }

  return result;
}

/**
 * El predicado que deja fuera lo terminado, o `null` si no hay nada que excluir.
 *
 * Los pares (proyecto, estado) van resueltos en memoria. La forma anterior —un
 * `NOT EXISTS` correlado contra `column`— obligaba a Postgres a reejecutar un
 * subplan **una vez por tarea**: 50.000 vueltas y 100.000 buffers para descartar
 * cuatro filas cada vez. Como lista literal es un filtro normal que se aplica
 * dentro del propio barrido.
 */
export function notDoneCondition(
  projectColumns: Map<string, ProjectColumns>,
): SQL | null {
  const finalPairs: SQL[] = [];

  for (const [id, { finals }] of projectColumns) {
    for (const slug of finals) {
      finalPairs.push(sql`(${id}, ${slug})`);
    }
  }

  if (finalPairs.length === 0) return null;

  return sql`(${taskTable.projectId}, ${taskTable.status}) NOT IN (${sql.join(
    finalPairs,
    sql`, `,
  )})`;
}

type DecoratableRow = { id: string; status: string; projectId: string };

/**
 * Etiquetas, asignados y "hecha" para las filas de **una pagina**.
 *
 * Dos consultas por lotes acotadas a los ids de la pagina, nunca una por fila.
 * Sin agregados del arbol: son por proyecto, y la Fase 4.5 los midio en 242 ms
 * fijos.
 *
 * `isDone` sale de la misma lista `finals` con la que se ha construido el
 * predicado, que es lo que impide que la bandera y el filtro discrepen.
 */
export async function decorateTasks<Row extends DecoratableRow>(
  rows: Row[],
  projectColumns: Map<string, ProjectColumns>,
) {
  if (rows.length === 0) return [];

  const taskIds = rows.map((row) => row.id);

  const [labelRows, assigneeRows] = await Promise.all([
    db
      .select({
        id: labelTable.id,
        name: labelTable.name,
        color: labelTable.color,
        taskId: labelTable.taskId,
      })
      .from(labelTable)
      .where(inArray(labelTable.taskId, taskIds)),
    db
      .select({
        taskId: taskAssigneeTable.taskId,
        id: userTable.id,
        name: userTable.name,
        image: userTable.image,
      })
      .from(taskAssigneeTable)
      .innerJoin(userTable, eq(taskAssigneeTable.userId, userTable.id))
      .where(inArray(taskAssigneeTable.taskId, taskIds))
      .orderBy(asc(taskAssigneeTable.createdAt)),
  ]);

  const labelsByTask = new Map<
    string,
    Array<{ id: string; name: string; color: string }>
  >();
  for (const label of labelRows) {
    if (!label.taskId) continue;
    const list = labelsByTask.get(label.taskId) ?? [];
    list.push({ id: label.id, name: label.name, color: label.color });
    labelsByTask.set(label.taskId, list);
  }

  const assigneesByTask = new Map<
    string,
    Array<{ id: string; name: string; image: string | null }>
  >();
  for (const assignee of assigneeRows) {
    const list = assigneesByTask.get(assignee.taskId) ?? [];
    list.push({ id: assignee.id, name: assignee.name, image: assignee.image });
    assigneesByTask.set(assignee.taskId, list);
  }

  return rows.map((row) => {
    const project = projectColumns.get(row.projectId);

    return {
      ...row,
      statusColumn:
        project?.columns.find((column) => column.slug === row.status) ?? null,
      isDone:
        project?.finals.includes(row.status) ??
        row.status === LEGACY_FINAL_STATUS,
      labels: labelsByTask.get(row.id) ?? [],
      assignees: assigneesByTask.get(row.id) ?? [],
    };
  });
}
