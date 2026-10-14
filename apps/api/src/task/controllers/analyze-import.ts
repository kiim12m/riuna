import { eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { projectTable } from "../../database/schema";
import { buildImportSource, resolveExternalRefs } from "../../external-ref";
import { inferColumnType } from "../exchange/infer-type";
import { loadImportLookups } from "../exchange/lookups";
import { mapRows, proposeMapping } from "../exchange/map-rows";
import { resolveOutline } from "../exchange/outline";
import { cellText, parseUploadedFile } from "../exchange/parse-file";

// Primer paso del asistente: leer el fichero y contar que se ha entendido, sin
// escribir nada. El asistente ensena esto y quien importa lo confirma o lo
// corrige antes de que nada toque la base.
//
// El fichero se sube dos veces —una aqui y otra al importar— a proposito: la
// alternativa era guardarlo en el servidor entre los dos pasos, y eso es estado
// que hay que caducar y que no sobrevive a una segunda instancia de la API.

/** Cuantos valores de ejemplo se devuelven por columna. */
const SAMPLE_SIZE = 5;

// El DTO va en primitivas y no reutiliza las uniones internas. Es lo correcto
// para un formato de cable, y ademas el cliente tipado de `@riuna/libs` no
// puede nombrar un tipo que vive dentro de `apps/api`.
export type AnalyzedColumn = {
  index: number;
  header: string;
  kind: "field" | "custom" | "ignore";
  /** Campo reservado al que apunta, cuando `kind` es "field". */
  field?: string;
  /** Clave del campo personalizado, cuando `kind` es "custom". */
  key?: string;
  /** Tipo propuesto para una columna que se convertiria en campo nuevo. */
  inferredType?: string;
  inferredOptions?: string[];
  /** Clave de la definicion que ya existe, si la hay. */
  existingFieldKey?: string;
  samples: string[];
};

export type AnalyzedOutlineIssue = {
  kind: string;
  index?: number;
  indexes?: number[];
  outline?: string;
  parentOutline?: string;
};

export type ImportAnalysis = {
  filename: string;
  /** Nombre de origen propuesto para `external_ref`. */
  source: string;
  rowCount: number;
  columns: AnalyzedColumn[];
  outline: {
    /** Cierto si el fichero trae la columna `Esquema`. */
    present: boolean;
    roots: number;
    maxDepth: number;
    issues: AnalyzedOutlineIssue[];
  };
  identity: {
    matchedById: number;
    matchedByReference: number;
    new: number;
  };
};

async function analyzeImport({
  projectId,
  buffer,
  filename,
  source,
}: {
  projectId: string;
  buffer: Buffer;
  filename: string;
  source?: string;
}): Promise<ImportAnalysis> {
  const project = await db.query.projectTable.findFirst({
    where: eq(projectTable.id, projectId),
  });

  if (!project) {
    throw new HTTPException(404, { message: "Project not found" });
  }

  const sheet = await parseUploadedFile(buffer, filename);
  const lookups = await loadImportLookups(projectId, project.workspaceId);
  const mapping = proposeMapping(sheet.headers);
  const resolvedSource = source?.trim() || buildImportSource(filename);

  const columns: AnalyzedColumn[] = mapping.map((column, index) => {
    const header = sheet.headers[index] ?? "";
    const values = sheet.rows.map((row) => cellText(row[index] ?? null));
    const samples = values.filter(Boolean).slice(0, SAMPLE_SIZE);

    if (column.target.kind === "ignore") {
      return { index, header, kind: "ignore", samples };
    }

    if (column.target.kind === "field") {
      return {
        index,
        header,
        kind: "field",
        field: column.target.field,
        samples,
      };
    }

    const key = column.target.key;

    // Un campo calculado no se importa: su valor sale de su formula (ADR 090).
    if (lookups.fieldTypes.get(key) === "formula") {
      return { index, header, kind: "ignore", samples };
    }

    if (lookups.fieldTypes.has(key)) {
      return {
        index,
        header,
        kind: "custom",
        key,
        existingFieldKey: key,
        samples,
      };
    }

    // Solo siembra el desplegable: `type` y `key` son inmutables (ADR 013), asi
    // que la ultima palabra tiene que ser de quien importa.
    const inferred = inferColumnType(values);
    return {
      index,
      header,
      kind: "custom",
      key,
      inferredType: inferred.type,
      inferredOptions: inferred.options,
      samples,
    };
  });

  const mapped = mapRows(sheet.rows, mapping, lookups.fieldTypes);
  const outline = resolveOutline(
    mapped.map((row) => ({ index: row.index, outline: row.outline })),
  );

  const outlinePresent = mapping.some(
    (column) =>
      column.target.kind === "field" && column.target.field === "outline",
  );

  const identity = await countIdentity(
    project.workspaceId,
    resolvedSource,
    mapped,
  );

  return {
    filename,
    source: resolvedSource,
    rowCount: sheet.rows.length,
    columns,
    outline: {
      present: outlinePresent,
      roots: outline.resolutions.filter((entry) => entry.parentIndex === null)
        .length,
      maxDepth: outline.resolutions.reduce(
        (deepest, entry) => Math.max(deepest, entry.depthInFile),
        0,
      ),
      issues: outline.issues,
    },
    identity,
  };
}

async function countIdentity(
  workspaceId: string,
  source: string,
  rows: Array<{ id: string | null; reference: string | null }>,
): Promise<ImportAnalysis["identity"]> {
  const references = [
    ...new Set(
      rows
        .filter((row) => !row.id && row.reference)
        .map((row) => row.reference as string),
    ),
  ];

  const known = references.length
    ? await resolveExternalRefs(workspaceId, source, "task", references)
    : new Map<string, string>();

  let matchedById = 0;
  let matchedByReference = 0;

  for (const row of rows) {
    if (row.id) matchedById += 1;
    else if (row.reference && known.has(row.reference)) matchedByReference += 1;
  }

  return {
    matchedById,
    matchedByReference,
    new: rows.length - matchedById - matchedByReference,
  };
}

export default analyzeImport;
