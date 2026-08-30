import { eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { columnTable, projectTable, taskTable } from "../../database/schema";
import { publishEvent } from "../../events";
import { filterAssignableUsers } from "../../utils/assert-assignable-user";
import { rootTaskTreeFields } from "../tree";
import {
  coercePriority,
  coerceStatus,
  getValidTaskStatuses,
} from "../validate-task-fields";
import { syncPrimaryAssignee } from "./assignees";
import claimTaskNumbers from "./claim-task-numbers";

export type ImportTask = {
  title: string;
  description?: string;
  status: string;
  priority?: string;
  startDate?: string | null;
  dueDate?: string | null;
  userId?: string | null;
};

// Cuantas filas entran por sentencia. Con 500 el numero de viajes deja de
// dominar y el tamano del INSERT sigue siendo manejable.
const INSERT_BATCH_SIZE = 500;

function chunk<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
}

/**
 * Importa un lote de tareas en un proyecto.
 *
 * Va en **una** transaccion con inserciones por lotes, no en una transaccion
 * por fila. La forma anterior hacia ~4 viajes a la base por fila —una consulta
 * de columna, `BEGIN`, el UPDATE de numeracion, el INSERT, `COMMIT`, y un
 * evento—, todos en serie: el criterio de la Fase 5 son 5.000 filas, que a 5 ms
 * por viaje son ~100 s en una sola peticion HTTP. Cualquier proxy corta antes,
 * y sin transaccion envolvente el corte dejaba media importacion hecha y sin
 * forma de reanudarla ni deshacerla.
 *
 * La jerarquia en el fichero importado llega en la Fase 5; hasta entonces toda
 * tarea importada entra como raiz.
 */
async function importTasks(
  projectId: string,
  tasksToImport: ImportTask[],
  currentUserId?: string,
) {
  const project = await db.query.projectTable.findFirst({
    where: eq(projectTable.id, projectId),
  });

  if (!project) {
    throw new HTTPException(404, {
      message: "Project not found",
    });
  }

  const assigneeIds = [
    ...new Set(
      tasksToImport
        .map((task) => task.userId?.trim())
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const assignableIds = await filterAssignableUsers(
    assigneeIds,
    project.workspaceId,
  );

  const validStatuses = await getValidTaskStatuses(projectId);

  // Las columnas del proyecto, una sola vez. Antes se consultaba dentro del
  // bucle, repitiendo la misma consulta para el mismo punado de slugs.
  const projectColumns = await db
    .select({ id: columnTable.id, slug: columnTable.slug })
    .from(columnTable)
    .where(eq(columnTable.projectId, projectId));

  const columnBySlug = new Map(
    projectColumns.map((column) => [column.slug, column.id]),
  );

  type Prepared = {
    values: typeof taskTable.$inferInsert;
    assigneeId: string | null;
    warnings: string[];
    source: ImportTask;
  };

  const prepared: Prepared[] = [];
  const results: Array<Record<string, unknown>> = [];

  // Primero se valida todo en memoria, para saber cuantos numeros reclamar y
  // para que una fila mala no aborte las buenas.
  for (const taskData of tasksToImport) {
    const assigneeId = taskData.userId?.trim() || null;

    if (assigneeId && !assignableIds.has(assigneeId)) {
      results.push({
        success: false,
        error: "Assignee is not a member of this workspace",
        task: taskData,
      });
      continue;
    }

    try {
      const { status, warning: statusWarning } = coerceStatus(
        taskData.status,
        validStatuses,
      );
      const { priority, warning: priorityWarning } = coercePriority(
        taskData.priority || "low",
      );
      const warnings = [statusWarning, priorityWarning].filter(
        (warning): warning is string => Boolean(warning),
      );

      prepared.push({
        assigneeId,
        warnings,
        source: taskData,
        values: {
          ...rootTaskTreeFields(),
          projectId,
          userId: assigneeId,
          title: taskData.title,
          status,
          columnId: columnBySlug.get(status) ?? null,
          startDate: taskData.startDate ? new Date(taskData.startDate) : null,
          dueDate: taskData.dueDate ? new Date(taskData.dueDate) : null,
          description: taskData.description || "",
          priority,
          // Se rellena abajo, cuando se sepa el primer numero del lote.
          number: 0,
        },
      });
    } catch (error) {
      results.push({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        task: taskData,
      });
    }
  }

  let created: (typeof taskTable.$inferSelect)[] = [];

  if (prepared.length > 0) {
    created = await db.transaction(async (tx) => {
      // Los N numeros de golpe, en vez de uno por fila. `claimTaskNumbers` ya
      // existia y solo lo usaba `moveTask`.
      const firstNumber = await claimTaskNumbers(
        projectId,
        prepared.length,
        tx,
      );

      prepared.forEach((entry, index) => {
        entry.values.number = firstNumber + index;
      });

      const inserted: (typeof taskTable.$inferSelect)[] = [];

      for (const batch of chunk(prepared, INSERT_BATCH_SIZE)) {
        const rows = await tx
          .insert(taskTable)
          .values(batch.map((entry) => entry.values))
          .returning();

        inserted.push(...rows);
      }

      // El conjunto de asignados, tambien por lotes y en la misma transaccion:
      // escribir `assignee_id` sin sincronizarlo es lo que dejaba divergir el
      // conjunto. Ver `assignees.ts`.
      for (const entry of prepared) {
        if (!entry.assigneeId) continue;
        await syncPrimaryAssignee(
          entry.values.id as string,
          null,
          entry.assigneeId,
          tx,
        );
      }

      return inserted;
    });
  }

  const createdById = new Map(created.map((task) => [task.id, task]));

  for (const entry of prepared) {
    const task = createdById.get(entry.values.id as string);

    if (!task) {
      results.push({
        success: false,
        error: "Failed to create task",
        task: entry.source,
      });
      continue;
    }

    results.push({
      success: true,
      task,
      ...(entry.warnings.length > 0 && { warnings: entry.warnings }),
    });
  }

  // Los eventos van **despues** del commit: emitirlos dentro haria que un
  // consumidor leyera una tarea que todavia no existe para el, y un fallo
  // posterior dejaria avisos de algo que se deshizo.
  for (const task of created) {
    await publishEvent("task.created", {
      ...task,
      taskId: task.id,
      userId: task.userId ?? "",
      currentUserId: currentUserId ?? "",
      type: "create",
      content: "imported the task",
    });
  }

  return {
    importedAt: new Date().toISOString(),
    project: {
      id: project.id,
      name: project.name,
      slug: project.slug,
    },
    results: {
      total: tasksToImport.length,
      successful: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
      tasks: results,
    },
  };
}

export default importTasks;
