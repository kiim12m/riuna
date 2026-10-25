import { eq } from "drizzle-orm";
import db from "../database";
import {
  epicTable,
  labelTable,
  taskEpicTable,
  taskTable,
} from "../database/schema";
import type { DbOrTx } from "../task/controllers/assignees";

/** Las epicas que se nombran, creando en el proyecto las que falten. */
export async function resolveEpics(
  projectId: string,
  names: string[],
  dbOrTx: DbOrTx = db,
): Promise<Map<string, string>> {
  const unique = [...new Set(names)].filter(Boolean);
  const byName = new Map<string, string>();

  if (unique.length === 0) return byName;

  const existing = await dbOrTx
    .select({ id: epicTable.id, name: epicTable.name })
    .from(epicTable)
    .where(eq(epicTable.projectId, projectId));

  for (const epic of existing) byName.set(epic.name, epic.id);

  const missing = unique.filter((name) => !byName.has(name));

  if (missing.length > 0) {
    const inserted = await dbOrTx
      .insert(epicTable)
      .values(
        missing.map((name, index) => ({
          projectId,
          name,
          position: existing.length + index + 1,
        })),
      )
      .returning({ id: epicTable.id, name: epicTable.name });

    for (const epic of inserted) byName.set(epic.name, epic.id);
  }

  return byName;
}

/**
 * Lo que una plantilla —de tarea o de recurrencia— le pone a una tarea recien
 * creada ademas de sus campos de base: campos personalizados, etiquetas y
 * epicas. Los valores ya vienen validados contra el proyecto
 * (`checkTemplateFits`) y las epicas resueltas (`resolveEpics`).
 *
 * Va en la transaccion que creo la tarea (`createTaskInTransaction`), y no
 * recalcula los campos calculados: lo hace el `afterCommit` de esa alta, que ya
 * ve estos valores porque corre cuando la transaccion se confirma.
 */
export async function decorateTask({
  taskId,
  workspaceId,
  customFields,
  labels,
  epics,
  epicIdsByName,
  dbOrTx = db,
}: {
  taskId: string;
  workspaceId: string;
  customFields?: Record<string, unknown>;
  labels?: Array<{ name: string; color: string }>;
  epics?: string[];
  epicIdsByName: Map<string, string>;
  dbOrTx?: DbOrTx;
}) {
  if (customFields) {
    await dbOrTx
      .update(taskTable)
      .set({ customFields })
      .where(eq(taskTable.id, taskId));
  }

  if (labels?.length) {
    await dbOrTx.insert(labelTable).values(
      labels.map((label) => ({
        workspaceId,
        taskId,
        name: label.name,
        color: label.color,
      })),
    );
  }

  if (epics?.length) {
    const epicIds = epics
      .map((name) => epicIdsByName.get(name))
      .filter((id): id is string => Boolean(id));

    if (epicIds.length > 0) {
      await dbOrTx
        .insert(taskEpicTable)
        .values(epicIds.map((epicId) => ({ taskId, epicId })))
        .onConflictDoNothing();
    }
  }
}
