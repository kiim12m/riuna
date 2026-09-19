import { eq, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import {
  fieldDefinitionTable,
  projectTable,
  taskTable,
} from "../../database/schema";
import { publishEvent } from "../../events";
import type { FieldType } from "../field-types";
import { storesValueInJson } from "../field-types";

/**
 * Borra la definicion y, con ella, el valor que las tareas tuvieran guardado.
 *
 * Dejar los valores seria dejar basura ilegible: sin definicion nada sabe que
 * tipo tienen ni como pintarlos, pero seguirian ocupando sitio en cada fila y
 * apareciendo en cualquier volcado del JSONB. Quien quiera conservarlos tiene
 * el archivado (`PATCH` con `archived: true`), que retira el campo de los
 * formularios sin tocar un solo valor.
 *
 * Las dos operaciones van en una transaccion: quedarse a medias dejaria
 * exactamente el estado que este borrado existe para evitar.
 */
async function deleteFieldDefinition(id: string, currentUserId: string) {
  const existing = await db.query.fieldDefinitionTable.findFirst({
    where: eq(fieldDefinitionTable.id, id),
  });

  if (!existing) {
    throw new HTTPException(404, { message: "Field definition not found" });
  }

  const deleted = await db.transaction(async (tx) => {
    if (storesValueInJson(existing.type as FieldType)) {
      // Cuando un proyecto declara la misma clave que un campo de espacio, en
      // ese proyecto gana el suyo (ADR 013, regla 4): el valor que guardan sus
      // tareas es de **su** campo, y borrar el de espacio no puede llevarselo.
      const scope = existing.projectId
        ? sql`${taskTable.projectId} = ${existing.projectId}`
        : sql`${taskTable.projectId} IN (
            SELECT ${projectTable.id} FROM ${projectTable}
            WHERE ${projectTable.workspaceId} = ${existing.workspaceId}
          ) AND ${taskTable.projectId} NOT IN (
            SELECT ${fieldDefinitionTable.projectId} FROM ${fieldDefinitionTable}
            WHERE ${fieldDefinitionTable.workspaceId} = ${existing.workspaceId}
              AND ${fieldDefinitionTable.projectId} IS NOT NULL
              AND ${fieldDefinitionTable.key} = ${existing.key}
          )`;

      // El `-` de jsonb quita la clave. El `::text` es explicito porque sin el
      // Postgres no puede elegir entre las variantes del operador, que es el
      // mismo tropiezo que dio `substring(... from $n)` en la Fase 2.
      await tx
        .update(taskTable)
        .set({
          customFields: sql`${taskTable.customFields} - ${existing.key}::text`,
        })
        // `jsonb_exists(...)` en vez del operador `?`: es la misma prueba, y
        // el `?` es el marcador de parametro de varios drivers, asi que
        // escribirlo aqui es pedirle un problema a la proxima capa que toque
        // esta consulta.
        .where(
          sql`${scope} AND jsonb_exists(${taskTable.customFields}, ${existing.key})`,
        );
    }

    const [row] = await tx
      .delete(fieldDefinitionTable)
      .where(eq(fieldDefinitionTable.id, id))
      .returning();

    return row;
  });

  if (!deleted) {
    throw new HTTPException(500, {
      message: "Failed to delete field definition",
    });
  }

  await publishEvent("field-definition.changed", {
    workspaceId: existing.workspaceId,
    projectId: existing.projectId,
    fieldDefinitionId: existing.id,
    userId: currentUserId,
  });

  return deleted;
}

export default deleteFieldDefinition;
