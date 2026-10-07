import { eq, inArray } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { projectTable } from "../../database/schema";
import { importTasksInTransaction, type Tx } from "../controllers/import-tasks";
import { proposeMapping } from "../exchange/map-rows";
import {
  loadProjectColumns,
  type PlannedRow,
  type ProjectChoice,
  SERVITEC_SOURCE,
  statusForEstado,
} from "./servitec-plan";

/** Las filas de un proyecto en el formato de intercambio (ADR 017). */
export async function importProjectRows(
  tx: Tx,
  {
    projectId,
    rows,
    currentUserId,
  }: { projectId: string; rows: PlannedRow[]; currentUserId: string },
) {
  const [project] = await tx
    .select()
    .from(projectTable)
    .where(eq(projectTable.id, projectId));
  if (!project) throw new HTTPException(404, { message: "Project not found" });
  // Las columnas ya estan en la base: un proyecto nuevo se crea antes.
  const columns = await loadProjectColumns(projectId);
  const headers = ["ID", "Referencia", "Título", "Estado"];
  const outcome = await importTasksInTransaction(
    tx,
    {
      projectId,
      currentUserId,
      source: SERVITEC_SOURCE,
      rows: rows.map((row) => [
        row.existing?.id ?? null,
        row.existing ? null : row.key,
        row.concepto,
        statusForEstado(row.estado, columns, row.existing?.status ?? null),
      ]),
      mapping: proposeMapping(headers),
    },
    project,
  );
  return { project, outcome };
}

/** Un proyecto elegido en el asistente tiene que ser de este espacio. */
export async function assertMappedProjects(
  workspaceId: string,
  choices: Record<string, ProjectChoice>,
) {
  const ids = Object.values(choices).flatMap((choice) =>
    choice.action === "map" ? [choice.projectId] : [],
  );
  if (ids.length === 0) return;
  const found = await db
    .select({ id: projectTable.id, workspaceId: projectTable.workspaceId })
    .from(projectTable)
    .where(inArray(projectTable.id, ids));
  if (
    found.some((project) => project.workspaceId !== workspaceId) ||
    found.length !== new Set(ids).size
  ) {
    throw new HTTPException(400, {
      message: "A chosen project is not in this workspace",
    });
  }
}
