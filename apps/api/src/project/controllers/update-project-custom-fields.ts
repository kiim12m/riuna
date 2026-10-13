import { and, eq, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { projectTable } from "../../database/schema";
import { publishEvent } from "../../events";
import { getWorkspaceFieldDefinitions } from "../../field/controllers/get-field-definitions";
import type { FieldType } from "../../field/field-types";
import {
  type FieldDefinitionLike,
  FieldValidationError,
  type FieldValueChanges,
  resolveFieldValueChanges,
} from "../../field/validate-field-values";
import { describeFieldChanges } from "../../task/controllers/update-task-custom-fields";
import { assertAssignableUser } from "../../utils/assert-assignable-user";

/**
 * Los valores de los campos de proyecto (ADR 088), como los de una tarea:
 * `values` es parcial, un valor vacio borra la clave, y la fusion va en SQL
 * sobre la fila bloqueada para que dos celdas a la vez no se pisen.
 */
async function updateProjectCustomFields({
  projectId,
  workspaceId,
  values,
  userId,
}: {
  projectId: string;
  workspaceId: string;
  values: Record<string, unknown>;
  userId: string;
}) {
  const [project] = await db
    .select({ ownerUserId: projectTable.ownerUserId })
    .from(projectTable)
    .where(
      and(
        eq(projectTable.id, projectId),
        eq(projectTable.workspaceId, workspaceId),
      ),
    )
    .limit(1);
  if (!project) throw new HTTPException(404, { message: "Project not found" });
  if (project.ownerUserId) {
    throw new HTTPException(400, {
      message: "A personal project has no project fields",
    });
  }

  const definitions = await getWorkspaceFieldDefinitions(
    workspaceId,
    false,
    "project",
  );

  let changes: FieldValueChanges;
  try {
    changes = resolveFieldValueChanges({
      definitions: definitions.map(
        (definition): FieldDefinitionLike => ({
          key: definition.key,
          name: definition.name,
          type: definition.type as FieldType,
          required: definition.required,
          config: definition.config,
        }),
      ),
      incoming: values,
    });
  } catch (error) {
    if (error instanceof FieldValidationError) {
      throw new HTTPException(400, { message: error.message });
    }
    throw error;
  }

  // Un campo «usuario» apunta a alguien del espacio, como en una tarea.
  const typeOf = new Map(definitions.map((d) => [d.key, d.type]));
  for (const [key, value] of Object.entries(changes.set)) {
    if (typeOf.get(key) !== "user" || typeof value !== "string") continue;
    await assertAssignableUser(value, workspaceId);
  }

  const { updated, previous } = await db.transaction(async (tx) => {
    const [before] = await tx
      .select({ customFields: projectTable.customFields })
      .from(projectTable)
      .where(eq(projectTable.id, projectId))
      .for("update");
    const [after] = await tx
      .update(projectTable)
      .set({
        customFields: sql`(${projectTable.customFields} || ${JSON.stringify(changes.set)}::jsonb) - ${sql.param(changes.clear)}::text[]`,
      })
      .where(eq(projectTable.id, projectId))
      .returning();
    return { updated: after, previous: before?.customFields ?? {} };
  });
  if (!updated) throw new HTTPException(404, { message: "Project not found" });

  const fieldChanges = describeFieldChanges(
    definitions,
    previous,
    updated.customFields ?? {},
    [...Object.keys(changes.set), ...changes.clear],
  );
  if (fieldChanges.length > 0) {
    await publishEvent("project.fields_changed", {
      projectId,
      workspaceId,
      userId,
      changes: fieldChanges,
    });
  }

  return updated;
}

export default updateProjectCustomFields;
