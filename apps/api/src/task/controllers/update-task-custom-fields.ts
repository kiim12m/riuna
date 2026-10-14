import { eq, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { taskTable } from "../../database/schema";
import { publishEvent } from "../../events";
import { getFieldDefinitionsForProject } from "../../field/controllers/get-field-definitions";
import type { FieldType } from "../../field/field-types";
import { refreshFormulasAfter } from "../../field/formula/refresh";
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

// Los tipos cuyo valor es un identificador y no algo que se pueda leer: el
// historial dice que el campo cambio, no a que id apunta.
const OPAQUE_TYPES = new Set(["user", "relation"]);

type FieldChange = {
  key: string;
  name: string;
  from?: unknown;
  to?: unknown;
};

export function describeFieldChanges(
  definitions: { key: string; name: string; type: string }[],
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  keys: string[],
): FieldChange[] {
  const byKey = new Map(
    definitions.map((definition) => [definition.key, definition]),
  );
  const changes: FieldChange[] = [];

  for (const key of new Set(keys)) {
    const definition = byKey.get(key);
    if (!definition) continue;
    const from = before[key] ?? null;
    const to = after[key] ?? null;
    if (JSON.stringify(from) === JSON.stringify(to)) continue;

    changes.push(
      OPAQUE_TYPES.has(definition.type)
        ? { key, name: definition.name }
        : { key, name: definition.name, from, to },
    );
  }

  return changes;
}

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
  //
  // En una transaccion y con la fila bloqueada para saber **que valor habia
  // justo antes**, que es lo que cuenta el historial: leerlo fuera dejaria una
  // ventana en la que otra edicion cambia el "de" que se anota.
  const { updatedTask, previous } = await db.transaction(async (tx) => {
    const [before] = await tx
      .select({ customFields: taskTable.customFields })
      .from(taskTable)
      .where(eq(taskTable.id, id))
      .for("update");

    const [after] = await tx
      .update(taskTable)
      .set({
        // `sql.param` en la lista de claves es obligatorio: en una plantilla
        // `sql`, drizzle expande un array a `($1, $2, ...)` en vez de pasarlo
        // como un solo parametro, y `- ()::text[]` no compila.
        customFields: sql`(${taskTable.customFields} || ${JSON.stringify(changes.set)}::jsonb) - ${sql.param(changes.clear)}::text[]`,
      })
      .where(eq(taskTable.id, id))
      .returning();

    return { updatedTask: after, previous: before?.customFields ?? {} };
  });

  if (!updatedTask) {
    throw new HTTPException(404, { message: "Task not found" });
  }

  // Lo que de verdad cambio: guardar el mismo valor no deja rastro.
  const fieldChanges = describeFieldChanges(
    definitions,
    (previous ?? {}) as Record<string, unknown>,
    (updatedTask.customFields ?? {}) as Record<string, unknown>,
    [...Object.keys(changes.set), ...changes.clear],
  );

  // Lo calculado que lee estos campos (ADR 090), antes de avisar: quien recargue
  // al recibir el evento ya lo ve. Se devuelve el documento con los valores
  // nuevos para que la celda que se acaba de confirmar no espere a la recarga.
  await refreshFormulasAfter({
    projectId: updatedTask.projectId,
    taskIds: [updatedTask.id],
  });
  const [refreshed] = await db
    .select({ customFields: taskTable.customFields })
    .from(taskTable)
    .where(eq(taskTable.id, id));

  if (fieldChanges.length > 0) {
    await publishEvent("task.custom_fields_changed", {
      taskId: updatedTask.id,
      projectId: updatedTask.projectId,
      title: updatedTask.title,
      userId: currentUserId,
      changes: fieldChanges,
    });
  }

  await publishEvent("task.updated", {
    taskId: updatedTask.id,
    projectId: updatedTask.projectId,
    title: updatedTask.title,
    status: updatedTask.status,
    userId: currentUserId,
  });

  return refreshed ? { ...updatedTask, ...refreshed } : updatedTask;
}

export default updateTaskCustomFields;
