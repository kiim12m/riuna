import { eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { fieldDefinitionTable } from "../../database/schema";
import { publishEvent } from "../../events";
import { type FieldType, parseFieldConfig } from "../field-types";
import {
  assertNotReadByFormulas,
  prepareFormulaConfig,
} from "../formula/definitions";
import {
  refreshProjectFormulas,
  refreshWorkspaceFormulas,
} from "../formula/refresh";

async function updateFieldDefinition({
  id,
  name,
  description,
  config,
  required,
  position,
  archived,
  currentUserId,
}: {
  id: string;
  name?: string;
  description?: string | null;
  config?: unknown;
  required?: boolean;
  position?: number;
  archived?: boolean;
  currentUserId: string;
}) {
  const existing = await db.query.fieldDefinitionTable.findFirst({
    where: eq(fieldDefinitionTable.id, id),
  });

  if (!existing) {
    throw new HTTPException(404, { message: "Field definition not found" });
  }

  const values: Partial<typeof fieldDefinitionTable.$inferInsert> = {};

  if (name !== undefined) {
    const trimmed = name.trim();
    if (!trimmed) {
      throw new HTTPException(400, { message: "Field name is required" });
    }
    // `key` no se toca nunca: es la clave con la que el valor esta guardado en
    // cada tarea, y renombrarla los huerfanaria a todos. Ver ADR 013.
    values.name = trimmed;
  }

  const isFormula = existing.type === "formula";

  if (description !== undefined) values.description = description;
  if (required !== undefined) {
    if (required && isFormula) {
      throw new HTTPException(400, {
        message: "A calculated field cannot be required",
      });
    }
    values.required = required;
  }
  if (position !== undefined) values.position = position;
  if (archived !== undefined) {
    // Archivar un campo que lee una formula la dejaria vacia sin explicacion.
    if (archived && !existing.archivedAt) {
      await assertNotReadByFormulas(existing);
    }
    values.archivedAt = archived ? new Date() : null;
  }

  if (config !== undefined) {
    try {
      values.config = parseFieldConfig(existing.type as FieldType, config);
    } catch (error) {
      throw new HTTPException(400, {
        message:
          error instanceof Error ? error.message : "Invalid configuration",
      });
    }
    if (isFormula) {
      values.config = await prepareFormulaConfig({
        workspaceId: existing.workspaceId,
        projectId: existing.projectId,
        key: existing.key,
        name: values.name ?? existing.name,
        config: values.config,
      });
    }
  }

  if (Object.keys(values).length === 0) {
    return existing;
  }

  const [updated] = await db
    .update(fieldDefinitionTable)
    .set(values)
    .where(eq(fieldDefinitionTable.id, id))
    .returning();

  if (!updated) {
    throw new HTTPException(500, {
      message: "Failed to update field definition",
    });
  }

  // Una formula nueva, o que vuelve del archivo, se recalcula entera. Cambiar
  // solo el formato no cambia ningun valor.
  const formulaChanged =
    isFormula &&
    ((values.config !== undefined &&
      values.config.expression !== existing.config.expression) ||
      (archived === false && existing.archivedAt !== null));
  if (formulaChanged) {
    if (updated.projectId) await refreshProjectFormulas(updated.projectId);
    else await refreshWorkspaceFormulas(updated.workspaceId);
  }

  await publishEvent("field-definition.changed", {
    workspaceId: updated.workspaceId,
    projectId: updated.projectId,
    fieldDefinitionId: updated.id,
    userId: currentUserId,
  });

  return updated;
}

export default updateFieldDefinition;
