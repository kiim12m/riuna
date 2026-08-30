import { eq, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { taskTable } from "../../database/schema";
import { publishEvent } from "../../events";
import { getFieldDefinitionsForProject } from "../../field/controllers/get-field-definitions";
import type { FieldType } from "../../field/field-types";
import {
  type FieldDefinitionLike,
  FieldValidationError,
  type FieldValueChanges,
  resolveFieldValueChanges,
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

  // Que un id de usuario exista y pertenezca al espacio de trabajo es lo unico
  // que el validador no puede comprobar por su cuenta, porque hace falta la
  // base. Se reutiliza la misma guarda que protege al responsable de la tarea,
  // de modo que un campo "usuario" no sea una puerta trasera para apuntar a
  // alguien de fuera del espacio.
  //
  // Solo se comprueban las claves que trae la peticion: mirar tambien las que
  // ya estaban guardadas bloqueaba con un 403 cualquier edicion posterior de
  // la tarea en cuanto el usuario de un campo dejaba el espacio, con un
  // mensaje que hablaba del responsable y no del campo culpable.
  const byKey = new Map(
    definitions.map((definition) => [definition.key, definition]),
  );

  for (const [key, value] of Object.entries(changes.set)) {
    if (byKey.get(key)?.type !== "user") continue;
    if (typeof value !== "string") continue;
    await assertAssignableUser(value, workspaceId);
  }

  // La fusion va en SQL, sobre el valor que la fila tenga en ese momento, en
  // vez de reescribir el documento leido antes. Ver `resolveFieldValueChanges`.
  const [updatedTask] = await db
    .update(taskTable)
    .set({
      // `sql.param` en la lista de claves es obligatorio: en una plantilla
      // `sql`, drizzle expande un array a `($1, $2, ...)` en vez de pasarlo
      // como un solo parametro, y `- ()::text[]` no compila.
      customFields: sql`(${taskTable.customFields} || ${JSON.stringify(changes.set)}::jsonb) - ${sql.param(changes.clear)}::text[]`,
    })
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
