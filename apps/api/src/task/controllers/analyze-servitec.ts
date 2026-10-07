import { normalizeProjectName } from "../exports/servitec-parse";
import { planServitecRows } from "../exports/servitec-plan";
import { readSheet } from "../exports/servitec-read";

/**
 * Lo que traeria la hoja, sin escribir nada: cuantas filas, cuantas son de
 * tareas que ya existen y a que proyecto va cada grupo. Un proyecto sin
 * `projectId` es un nombre que no existe y que el asistente tiene que resolver.
 */
export async function analyzeServitec(workspaceId: string, buffer: Buffer) {
  const rows = await planServitecRows(workspaceId, await readSheet(buffer));
  const projects = new Map<
    string,
    { name: string; projectId: string | null; rows: number }
  >();
  for (const row of rows) {
    const key = row.projectId ?? `name:${normalizeProjectName(row.proyecto)}`;
    const entry = projects.get(key) ?? {
      name: row.proyecto,
      projectId: row.projectId,
      rows: 0,
    };
    entry.rows += 1;
    projects.set(key, entry);
  }
  return {
    rows: rows.length,
    existing: rows.filter((row) => row.existing).length,
    comments: rows.reduce((sum, row) => sum + row.comentarios.length, 0),
    projects: [...projects.values()],
  };
}
