import { and, eq, inArray, sql } from "drizzle-orm";
import db from "../database";
import { externalRefTable } from "../database/schema";

type DbOrTx = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

// Traduccion entre los identificadores de un sistema ajeno y los de Riuna.
// Es la pieza que hace idempotente una importacion: reimportar el mismo
// fichero encuentra lo que creo la vez anterior en vez de duplicarlo.
//
// La unicidad de `(workspace_id, source, entity_type, external_id)` **es** la
// idempotencia. Por eso el alta va con `onConflictDoUpdate` y no con un
// `findFirst` seguido de un `insert`, que es lo que hacen los importadores de
// GitHub y Gitea: funciona en secuencia y duplica en cuanto hay dos peticiones
// a la vez.
//
// La Fase 8 reutiliza estas dos funciones tal cual para Trello, Jira y Asana:
// lo unico que cambia es el `source`.

export type ExternalRefEntityType = "task" | "epic" | "field_definition";

/** Cuantas parejas entran por sentencia. */
const BATCH_SIZE = 500;

/**
 * El nombre de origen por defecto de un fichero. Es estable frente al
 * contenido a proposito: si dependiera del hash, editar una celda romperia la
 * idempotencia justo cuando mas se necesita, que es al corregir y reimportar.
 */
export function buildImportSource(filename: string): string {
  const name = filename.replace(/\.[^.]+$/, "").trim();
  const kind = /\.xlsx?$/i.test(filename) ? "xlsx" : "csv";
  return `${kind}:${name || "import"}`;
}

/**
 * De identificador externo a identificador de Riuna, para los que ya existan.
 * Los que no esten simplemente no aparecen en el mapa.
 */
export async function resolveExternalRefs(
  workspaceId: string,
  source: string,
  entityType: ExternalRefEntityType,
  externalIds: readonly string[],
  dbOrTx: DbOrTx = db,
): Promise<Map<string, string>> {
  const resolved = new Map<string, string>();
  const unique = [...new Set(externalIds.filter(Boolean))];

  if (unique.length === 0) {
    return resolved;
  }

  for (const batch of chunk(unique, BATCH_SIZE)) {
    const rows = await dbOrTx
      .select({
        externalId: externalRefTable.externalId,
        entityId: externalRefTable.entityId,
      })
      .from(externalRefTable)
      .where(
        and(
          eq(externalRefTable.workspaceId, workspaceId),
          eq(externalRefTable.source, source),
          eq(externalRefTable.entityType, entityType),
          inArray(externalRefTable.externalId, batch),
        ),
      );

    for (const row of rows) {
      resolved.set(row.externalId, row.entityId);
    }
  }

  return resolved;
}

/**
 * Deja anotado a que entidad de Riuna corresponde cada identificador externo.
 * Reescribe el destino si ya habia uno: la fila externa manda, y quien la
 * reimporta espera que apunte a lo ultimo que se creo con ella.
 */
export async function upsertExternalRefs(
  workspaceId: string,
  source: string,
  entityType: ExternalRefEntityType,
  pairs: ReadonlyArray<{ externalId: string; entityId: string }>,
  dbOrTx: DbOrTx = db,
): Promise<void> {
  // Un identificador externo repetido dentro del mismo lote hace fallar el
  // `ON CONFLICT DO UPDATE` con "cannot affect row a second time". Gana la
  // ultima pareja, que es el mismo criterio que aplica la fila a la fila.
  const byExternalId = new Map<string, string>();
  for (const pair of pairs) {
    if (pair.externalId && pair.entityId) {
      byExternalId.set(pair.externalId, pair.entityId);
    }
  }

  const usable = [...byExternalId].map(([externalId, entityId]) => ({
    externalId,
    entityId,
  }));

  if (usable.length === 0) {
    return;
  }

  for (const batch of chunk(usable, BATCH_SIZE)) {
    await dbOrTx
      .insert(externalRefTable)
      .values(
        batch.map((pair) => ({
          workspaceId,
          source,
          entityType,
          entityId: pair.entityId,
          externalId: pair.externalId,
        })),
      )
      .onConflictDoUpdate({
        target: [
          externalRefTable.workspaceId,
          externalRefTable.source,
          externalRefTable.entityType,
          externalRefTable.externalId,
        ],
        set: {
          entityId: sql`excluded.entity_id`,
          updatedAt: new Date(),
        },
      });
  }
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
}
