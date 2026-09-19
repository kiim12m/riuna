import { createId } from "@paralleldrive/cuid2";
import { sql } from "drizzle-orm";
import type db from "../../database";
import {
  labelTable,
  taskAssigneeTable,
  taskEpicTable,
} from "../../database/schema";

// Reconciliacion de las tablas que cuelgan de una tarea: asignados, epicas y
// etiquetas. El fichero dice el conjunto entero, igual que hacen
// `replaceAssignees` y `updateTaskEpics`, asi que reconciliar es quitar lo que
// sobra y poner lo que falta.
//
// Va en dos sentencias por tabla y no en dos por tarea: con 5.000 filas la
// diferencia es 4 viajes contra 20.000.
//
// Ojo con Drizzle: dentro de una plantilla `sql`, todo array va en
// `sql.param()`. Un array suelto se expande como `($1, $2)`.

type DbOrTx = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

export type Link = { taskId: string; valueId: string };

/**
 * Deja cada tarea de `taskIds` con exactamente los enlaces de `links`. Una
 * tarea incluida sin ningun enlace se queda vacia, que es lo que significa una
 * celda en blanco en una columna que el fichero si mapea.
 */
export async function reconcileAssignees(
  tx: DbOrTx,
  taskIds: readonly string[],
  links: readonly Link[],
): Promise<void> {
  if (taskIds.length === 0) return;

  await deleteMissing(tx, "task_assignee", "user_id", taskIds, links);

  if (links.length > 0) {
    await tx
      .insert(taskAssigneeTable)
      .values(
        links.map((link) => ({
          id: createId(),
          taskId: link.taskId,
          userId: link.valueId,
        })),
      )
      .onConflictDoNothing();
  }
}

export type PrimaryChange = {
  taskId: string;
  previousUserId: string | null;
  nextUserId: string | null;
};

/**
 * Para un fichero que trae el responsable y no la lista de asignados: el
 * anterior sale del conjunto y el nuevo entra, sin tocar a nadie mas. Es lo que
 * hace `syncPrimaryAssignee` en la via de un solo responsable (ADR 010), aqui en
 * dos sentencias para todo el lote. Una columna que el fichero no trae no puede
 * vaciar lo que ya hay escrito (regla 3 de la ADR 017).
 */
export async function reconcilePrimaryAssignees(
  tx: DbOrTx,
  changes: readonly PrimaryChange[],
): Promise<void> {
  const leaving = changes.filter(
    (change): change is PrimaryChange & { previousUserId: string } =>
      change.previousUserId !== null &&
      change.previousUserId !== change.nextUserId,
  );

  if (leaving.length > 0) {
    await tx.execute(sql`
      DELETE FROM "task_assignee" AS "row"
      USING unnest(
        ${sql.param(leaving.map((change) => change.taskId))}::text[],
        ${sql.param(leaving.map((change) => change.previousUserId))}::text[]
      ) AS leaving(task_id, user_id)
      WHERE "row"."task_id" = leaving.task_id
        AND "row"."user_id" = leaving.user_id
    `);
  }

  const arriving = changes.filter(
    (change): change is PrimaryChange & { nextUserId: string } =>
      change.nextUserId !== null && change.nextUserId !== change.previousUserId,
  );

  if (arriving.length > 0) {
    await tx
      .insert(taskAssigneeTable)
      .values(
        arriving.map((change) => ({
          id: createId(),
          taskId: change.taskId,
          userId: change.nextUserId,
        })),
      )
      .onConflictDoNothing();
  }
}

export async function reconcileEpics(
  tx: DbOrTx,
  taskIds: readonly string[],
  links: readonly Link[],
): Promise<void> {
  if (taskIds.length === 0) return;

  await deleteMissing(tx, "task_epic", "epic_id", taskIds, links);

  if (links.length > 0) {
    await tx
      .insert(taskEpicTable)
      .values(
        links.map((link) => ({
          id: createId(),
          taskId: link.taskId,
          epicId: link.valueId,
        })),
      )
      .onConflictDoNothing();
  }
}

export type LabelLink = {
  taskId: string;
  name: string;
  color: string;
  workspaceId: string;
};

/**
 * Las etiquetas no son una tabla de union: cada una es su propia fila con
 * `task_id`. Se reconcilian por nombre, que es lo unico que un fichero trae.
 */
export async function reconcileLabels(
  tx: DbOrTx,
  taskIds: readonly string[],
  labels: readonly LabelLink[],
): Promise<void> {
  if (taskIds.length === 0) return;

  await deleteMissing(
    tx,
    "label",
    "name",
    taskIds,
    labels.map((label) => ({ taskId: label.taskId, valueId: label.name })),
  );

  if (labels.length > 0) {
    await tx
      .insert(labelTable)
      .values(
        labels.map((label) => ({
          id: createId(),
          name: label.name,
          color: label.color,
          taskId: label.taskId,
          workspaceId: label.workspaceId,
        })),
      )
      .onConflictDoNothing({
        target: [labelTable.taskId, labelTable.name],
      });
  }
}

/**
 * Borra de `table` los enlaces de esas tareas que el fichero ya no nombra.
 *
 * El `NOT EXISTS` contra un `unnest` de parejas es lo que permite hacerlo de
 * una vez para todas las tareas: con un `NOT IN` por tarea serian tantas
 * sentencias como filas.
 */
async function deleteMissing(
  tx: DbOrTx,
  table: string,
  valueColumn: string,
  taskIds: readonly string[],
  links: readonly Link[],
): Promise<void> {
  const pairTaskIds = links.map((link) => link.taskId);
  const pairValues = links.map((link) => link.valueId);

  await tx.execute(sql`
    DELETE FROM ${sql.identifier(table)} AS "row"
    WHERE "row"."task_id" = ANY(${sql.param(taskIds as string[])}::text[])
      AND NOT EXISTS (
        SELECT 1
        FROM unnest(
          ${sql.param(pairTaskIds)}::text[],
          ${sql.param(pairValues)}::text[]
        ) AS wanted(task_id, value)
        WHERE wanted.task_id = "row"."task_id"
          AND wanted.value = "row".${sql.identifier(valueColumn)}
      )
  `);
}
