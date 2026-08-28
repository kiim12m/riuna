import { eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { taskTable } from "../../database/schema";
import { publishEvent } from "../../events";
import { getFieldDefinitionsForProject } from "../../field/controllers/get-field-definitions";
import type { FieldType } from "../../field/field-types";
import {
  applyFieldValues,
  type FieldDefinitionLike,
  FieldValidationError,
} from "../../field/validate-field-values";
import {
  assertAssignableUser,
  getProjectWorkspaceId,
} from "../../utils/assert-assignable-user";

/**
 * Escribe valores de campos personalizados en una tarea.
 *
 * `values` es parcial: lleva solo lo que cambia, y lo que no venga se conserva.
 * Un valor vacio borra la clave. Los campos obligatorios no se exigen aqui
 * —solo se impide vaciarlos— porque exigirlos al editar bloquearia tocar
 * cualquier otra cosa de una tarea anterior a que el campo se declarase
 * obligatorio.
 */
async function updateTaskCustomFields({
  id,
  values,
  currentUserId,
}: {
  id: string;
  values: Record<string, unknown>;
  currentUserId: string;
}) {
  const [task] = await db
    .select({
      id: taskTable.id,
      projectId: taskTable.projectId,
      customFields: taskTable.customFields,
    })
    .from(taskTable)
    .where(eq(taskTable.id, id))
    .limit(1);

  if (!task) {
    throw new HTTPException(404, { message: "Task not found" });
  }

  const workspaceId = await getProjectWorkspaceId(task.projectId);
  const definitions = await getFieldDefinitionsForProject(
    workspaceId,
    task.projectId,
  );

  let customFields: Record<string, unknown>;

  try {
    customFields = applyFieldValues({
      definitions: definitions.map(
        (definition): FieldDefinitionLike => ({
          key: definition.key,
          name: definition.name,
          type: definition.type as FieldType,
          required: definition.required,
          config: definition.config,
        }),
      ),
      current: task.customFields,
      incoming: values,
    });
  } catch (error) {
    if (error instanceof FieldValidationError) {
      throw new HTTPException(400, { message: error.message });
    }
    throw error;
  }

  // Que un id de usuario exista y pertenezca al espacio de trabajo es lo unico
  // que el validador no puede comprobar por su cuenta, porque hace falta la
  // base. Se reutiliza la misma guarda que protege al responsable de la tarea,
  // de modo que un campo "usuario" no sea una puerta trasera para apuntar a
  // alguien de fuera del espacio.
  for (const definition of definitions) {
    if (definition.type !== "user") continue;
    const value = customFields[definition.key];
    if (typeof value !== "string") continue;
    await assertAssignableUser(value, workspaceId);
  }

  const [updatedTask] = await db
    .update(taskTable)
    .set({ customFields })
    .where(eq(taskTable.id, id))
    .returning();

  if (!updatedTask) {
    throw new HTTPException(404, { message: "Task not found" });
  }

  await publishEvent("task.updated", {
    taskId: updatedTask.id,
    projectId: updatedTask.projectId,
    title: updatedTask.title,
    status: updatedTask.status,
    userId: currentUserId,
  });

  return updatedTask;
}

export default updateTaskCustomFields;
