import { and, asc, eq, inArray } from "drizzle-orm";
import db from "../../database";
import { columnTable, projectTable, taskTable } from "../../database/schema";
import { resolveExternalRefs } from "../../external-ref";
import { resolveEstado } from "../controllers/export-workspace-tasks";
import {
  identityKeys,
  normalizeProjectName,
  type ServitecImportRow,
} from "./servitec-parse";
import type { ServitecEstado } from "./servitec-workbook";

/** El origen de lo importado de la hoja en `external_ref`. */
export const SERVITEC_SOURCE = "servitec";

export type ProjectChoice =
  | { action: "map"; projectId: string }
  | { action: "create" }
  | { action: "skip" };

export type PlannedRow = ServitecImportRow & {
  /** Huella para `external_ref` cuando la fila no trae id. */
  key: string;
  /** La tarea que ya existe para esta fila, por id o por huella. */
  existing: { id: string; projectId: string; status: string } | null;
  /** Proyecto de la hoja ya resuelto, o nulo si nadie sabe cual es. */
  projectId: string | null;
};

/**
 * A que proyecto va cada fila y que tarea es ya, si lo es (ADR 069).
 *
 * - **Una fila con id va al proyecto de su tarea**, diga lo que diga PROYECTO:
 *   la hoja no mueve tareas de proyecto.
 * - Sin id, la huella de proyecto + concepto + fecha en `external_ref`
 *   reconoce lo que ya se importo de esa misma hoja.
 * - Una fila nueva va al proyecto que se llama como dice PROYECTO; si ninguno
 *   se llama asi, queda sin proyecto y lo decide quien importa.
 */
export async function planServitecRows(
  workspaceId: string,
  rows: readonly ServitecImportRow[],
): Promise<PlannedRow[]> {
  const keys = identityKeys(rows);
  const ids = rows.flatMap((row) => (row.id ? [row.id] : []));

  const [projects, byId, refs] = await Promise.all([
    db
      .select({
        id: projectTable.id,
        name: projectTable.name,
        ownerUserId: projectTable.ownerUserId,
        archivedAt: projectTable.archivedAt,
      })
      .from(projectTable)
      .where(eq(projectTable.workspaceId, workspaceId)),
    ids.length === 0
      ? []
      : db
          .select({
            id: taskTable.id,
            projectId: taskTable.projectId,
            status: taskTable.status,
          })
          .from(taskTable)
          .innerJoin(projectTable, eq(projectTable.id, taskTable.projectId))
          .where(
            and(
              inArray(taskTable.id, ids),
              eq(projectTable.workspaceId, workspaceId),
            ),
          ),
    resolveExternalRefs(workspaceId, SERVITEC_SOURCE, "task", keys),
  ]);

  const refTaskIds = [...new Set(refs.values())];
  const byRef =
    refTaskIds.length === 0
      ? []
      : await db
          .select({
            id: taskTable.id,
            projectId: taskTable.projectId,
            status: taskTable.status,
          })
          .from(taskTable)
          .where(inArray(taskTable.id, refTaskIds));

  const taskById = new Map([...byId, ...byRef].map((task) => [task.id, task]));
  // Los «Personal» y los archivados no reciben filas por su nombre.
  const projectByName = new Map(
    projects
      .filter((project) => !project.ownerUserId && !project.archivedAt)
      .map((project) => [normalizeProjectName(project.name), project.id]),
  );

  return rows.map((row, index) => {
    const key = keys[index] ?? "";
    const refId = refs.get(key);
    const existing =
      (row.id ? taskById.get(row.id) : undefined) ??
      (refId ? taskById.get(refId) : undefined) ??
      null;
    return {
      ...row,
      key,
      existing,
      projectId:
        existing?.projectId ??
        projectByName.get(normalizeProjectName(row.proyecto)) ??
        null,
    };
  });
}

type ProjectColumn = { slug: string; position: number; isFinal: boolean };

export function loadProjectColumns(projectId: string) {
  return db
    .select({
      slug: columnTable.slug,
      position: columnTable.position,
      isFinal: columnTable.isFinal,
    })
    .from(columnTable)
    .where(eq(columnTable.projectId, projectId))
    .orderBy(asc(columnTable.position));
}

/**
 * El estado de la hoja como columna del proyecto: el inverso de
 * `resolveEstado`. Si la tarea ya esta en una columna que la hoja escribiria
 * igual, se queda donde esta: «En curso» cubre «En curso» y «En revisión», y
 * volver a subir la hoja no puede devolver una tarea de la segunda a la
 * primera.
 */
export function statusForEstado(
  estado: ServitecEstado,
  columns: readonly ProjectColumn[],
  current: string | null,
): string {
  if (current) {
    const column = columns.find((item) => item.slug === current);
    if (resolveEstado(current, column) === estado) return current;
  }

  const [first] = columns;
  switch (estado) {
    case ".Realizado":
      return "archived";
    case "Realizado":
      return (
        columns.find((column) => column.isFinal)?.slug ??
        columns.at(-1)?.slug ??
        "planned"
      );
    case "En curso":
      return (
        columns.find(
          (column) =>
            column.position > (first?.position ?? 0) && !column.isFinal,
        )?.slug ??
        first?.slug ??
        "planned"
      );
    case "Pendiente":
      return first?.slug ?? "planned";
  }
}
