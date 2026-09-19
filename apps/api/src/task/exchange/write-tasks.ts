import { sql } from "drizzle-orm";
import type db from "../../database";
import { taskTable } from "../../database/schema";

// Escritura por lotes de las tareas que una importacion actualiza.
//
// Insertar ya lo hace bien Drizzle con `.values([...])`. Actualizar no: una
// sentencia por fila son 5.000 viajes a la base, que es el orden de magnitud
// que la Fase 4.5 midio en 33 s. Aqui va **una sentencia por lote**, con la
// forma multiargumento de `unnest`, que recorre las columnas en paralelo.
//
// Cuidado con Drizzle dentro de una plantilla `sql`: expande un array suelto
// como `($1, $2)`, asi que `${ids}::text[]` compila a `($1, $2)::text[]` y un
// array vacio a `()`, que es error de sintaxis. Todo array va en `sql.param()`.

type DbOrTx = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

const UPDATE_BATCH_SIZE = 500;

/** Que columnas trae el fichero. Lo que no mapea no se toca. */
export type UpdatableField =
  | "title"
  | "description"
  | "status"
  | "priority"
  | "startDate"
  | "dueDate"
  | "estimate"
  | "assigneeId"
  | "teamId";

export type TaskUpdate = {
  id: string;
  title: string | null;
  description: string | null;
  status: string | null;
  columnId: string | null;
  priority: string | null;
  startDate: Date | null;
  dueDate: Date | null;
  estimate: number | null;
  assigneeId: string | null;
  teamId: string | null;
  /**
   * Orden entre hermanas, cuando la importacion lo recalcula. No sale del
   * fichero como columna, asi que no lo gobierna `fields`: se aplica si viene y
   * se deja como esta si no (`COALESCE`).
   */
  position?: number;
  /** Valores a fijar dentro de `custom_fields`. */
  customFieldsSet: Record<string, unknown>;
  /** Claves a borrar de `custom_fields`. */
  customFieldsClear: string[];
};

type Piece = {
  /** Nombre de la columna en `task`, y de la columna virtual de `u`. */
  name: string;
  /** Tipo del array que se pasa a `unnest`. */
  cast: string;
  values: unknown[];
};

/**
 * Aplica las actualizaciones en lotes. `fields` dice que columnas trae el
 * fichero: el resto se queda como esta, porque una columna que el fichero no
 * mapea no puede vaciar lo que ya hay escrito.
 */
export async function updateTaskRows(
  tx: DbOrTx,
  updates: readonly TaskUpdate[],
  fields: ReadonlySet<UpdatableField>,
  touchesCustomFields: boolean,
): Promise<number> {
  if (updates.length === 0) {
    return 0;
  }

  let affected = 0;

  for (let start = 0; start < updates.length; start += UPDATE_BATCH_SIZE) {
    const batch = updates.slice(start, start + UPDATE_BATCH_SIZE);
    affected += await updateBatch(tx, batch, fields, touchesCustomFields);
  }

  return affected;
}

async function updateBatch(
  tx: DbOrTx,
  batch: readonly TaskUpdate[],
  fields: ReadonlySet<UpdatableField>,
  touchesCustomFields: boolean,
): Promise<number> {
  const pieces: Piece[] = [
    { name: "id", cast: "text[]", values: batch.map((row) => row.id) },
  ];
  // `updated_at` no se toma del fichero: la fila se acaba de tocar aqui.
  const assignments = [sql`"updated_at" = now()`];

  const plain: Array<
    [UpdatableField, string, string, (row: TaskUpdate) => unknown]
  > = [
    ["title", "title", "text[]", (row) => row.title],
    ["description", "description", "text[]", (row) => row.description],
    ["status", "status", "text[]", (row) => row.status],
    ["status", "column_id", "text[]", (row) => row.columnId],
    ["priority", "priority", "text[]", (row) => row.priority],
    ["startDate", "start_date", "timestamp[]", (row) => row.startDate],
    ["dueDate", "due_date", "timestamp[]", (row) => row.dueDate],
    ["estimate", "estimate", "integer[]", (row) => row.estimate],
    ["assigneeId", "assignee_id", "text[]", (row) => row.assigneeId],
    ["teamId", "team_id", "text[]", (row) => row.teamId],
  ];

  for (const [field, name, cast, read] of plain) {
    if (!fields.has(field)) continue;
    pieces.push({ name, cast, values: batch.map(read) });
    assignments.push(sql`${sql.identifier(name)} = ${sql.raw(`u.${name}`)}`);
  }

  // `position` no viene del fichero: lo recalcula el reordenado de hermanas y
  // solo para algunas filas. `COALESCE` deja intactas las demas.
  if (batch.some((row) => row.position !== undefined)) {
    pieces.push({
      name: "position",
      cast: "integer[]",
      values: batch.map((row) => row.position ?? null),
    });
    assignments.push(sql`"position" = COALESCE(u.position, "task"."position")`);
  }

  if (touchesCustomFields) {
    pieces.push({
      name: "custom_fields_set",
      cast: "jsonb[]",
      values: batch.map((row) => JSON.stringify(row.customFieldsSet)),
    });
    // Una lista dentro de `unnest` no puede ser un array de arrays, asi que las
    // claves viajan unidas por comas y se separan dentro de la sentencia. Es
    // seguro: `slugifyFieldKey` deja la clave en [a-z0-9_].
    pieces.push({
      name: "custom_fields_clear",
      cast: "text[]",
      values: batch.map((row) => row.customFieldsClear.join(",")),
    });
    // Se funde en vez de sustituir, igual que `updateTaskCustomFields`: el
    // fichero solo sabe de las columnas que trae, y sustituir el documento
    // entero borraria los campos que no aparecen en el.
    assignments.push(
      sql`"custom_fields" = ("task"."custom_fields" || u.custom_fields_set) - string_to_array(COALESCE(u.custom_fields_clear, ''), ',')`,
    );
  }

  const unnestArgs = pieces.map(
    (piece) => sql`${sql.param(piece.values)}::${sql.raw(piece.cast)}`,
  );
  const columnList = sql.raw(pieces.map((piece) => piece.name).join(", "));

  const result = await tx.execute(sql`
    UPDATE ${taskTable} AS "task"
    SET ${sql.join(assignments, sql`, `)}
    FROM unnest(${sql.join(unnestArgs, sql`, `)}) AS u(${columnList})
    WHERE "task"."id" = u.id
  `);

  return result.rowCount ?? 0;
}
