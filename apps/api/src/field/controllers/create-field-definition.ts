import { and, eq, isNull, max } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { fieldDefinitionTable } from "../../database/schema";
import { publishEvent } from "../../events";
import {
  type FieldType,
  parseFieldConfig,
  slugifyFieldKey,
} from "../field-types";

async function createFieldDefinition({
  workspaceId,
  projectId,
  name,
  type,
  description,
  config,
  required,
  currentUserId,
  entity = "task",
}: {
  workspaceId: string;
  projectId: string | null;
  /** De tarea o, definido en el espacio, de proyecto (ADR 088). */
  entity?: "task" | "project";
  name: string;
  type: FieldType;
  description?: string | null;
  config?: unknown;
  required?: boolean;
  currentUserId: string;
}) {
  const trimmed = name.trim();

  if (entity === "project") {
    if (projectId) {
      throw new HTTPException(400, {
        message: "A project field is defined in the workspace",
      });
    }
    // Una relacion enlaza tareas: en un proyecto no tiene a que apuntar.
    if (type === "relation") {
      throw new HTTPException(400, {
        message: "A project field cannot be a relation",
      });
    }
  }

  if (!trimmed) {
    throw new HTTPException(400, { message: "Field name is required" });
  }

  const key = slugifyFieldKey(trimmed);

  if (!key) {
    throw new HTTPException(400, {
      message: "Field name must contain at least one letter or digit",
    });
  }

  let parsedConfig: Record<string, unknown>;
  try {
    parsedConfig = parseFieldConfig(type, config);
  } catch (error) {
    throw new HTTPException(400, {
      message: error instanceof Error ? error.message : "Invalid configuration",
    });
  }

  // El indice unico parcial ya lo impide, pero un 409 con el nombre del campo
  // se lee mucho mejor que el 500 de una violacion de restriccion.
  const scope = projectId
    ? eq(fieldDefinitionTable.projectId, projectId)
    : and(
        eq(fieldDefinitionTable.workspaceId, workspaceId),
        isNull(fieldDefinitionTable.projectId),
        eq(fieldDefinitionTable.entity, entity),
      );

  const [existing] = await db
    .select({ id: fieldDefinitionTable.id })
    .from(fieldDefinitionTable)
    .where(and(scope, eq(fieldDefinitionTable.key, key)))
    .limit(1);

  if (existing) {
    throw new HTTPException(409, {
      message: `A field called "${trimmed}" already exists in this ${projectId ? "project" : "workspace"}`,
    });
  }

  const [row] = await db
    .select({ maxPosition: max(fieldDefinitionTable.position) })
    .from(fieldDefinitionTable)
    .where(scope);

  const [definition] = await db
    .insert(fieldDefinitionTable)
    .values({
      workspaceId,
      projectId,
      key,
      name: trimmed,
      type,
      description: description ?? null,
      config: parsedConfig,
      // «Obligatorio» se pide al crear una tarea; un proyecto no pasa por ahi.
      required: entity === "project" ? false : (required ?? false),
      position: (row?.maxPosition ?? 0) + 1,
      entity,
    })
    .returning();

  if (!definition) {
    throw new HTTPException(500, {
      message: "Failed to create field definition",
    });
  }

  await publishEvent("field-definition.changed", {
    workspaceId,
    projectId,
    fieldDefinitionId: definition.id,
    userId: currentUserId,
  });

  return definition;
}

export default createFieldDefinition;
