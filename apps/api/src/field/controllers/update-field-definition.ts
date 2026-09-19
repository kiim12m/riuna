import { eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { fieldDefinitionTable } from "../../database/schema";
import { publishEvent } from "../../events";
import { type FieldType, parseFieldConfig } from "../field-types";

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

  if (description !== undefined) values.description = description;
  if (required !== undefined) values.required = required;
  if (position !== undefined) values.position = position;
  if (archived !== undefined) {
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

  await publishEvent("field-definition.changed", {
    workspaceId: updated.workspaceId,
    projectId: updated.projectId,
    fieldDefinitionId: updated.id,
    userId: currentUserId,
  });

  return updated;
}

export default updateFieldDefinition;
