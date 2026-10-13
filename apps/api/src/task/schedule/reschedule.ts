import { eq, inArray, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { projectTable, taskTable } from "../../database/schema";
import { publishEvent } from "../../events";
import type { DbOrTx } from "../controllers/assignees";
import { lockProjectTree } from "../controllers/lock-project-tree";
import {
  computeSchedule,
  type ScheduleChange,
  ScheduleCycleError,
} from "./compute-schedule";
import { loadWorkCalendar } from "./work-calendar";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function loadProject(executor: DbOrTx, projectId: string) {
  const [project] = await executor
    .select({ workspaceId: projectTable.workspaceId })
    .from(projectTable)
    .where(eq(projectTable.id, projectId))
    .limit(1);
  return project ?? null;
}

/**
 * Si algun ancestro de las tareas que cambiaron —ellas incluidas— tiene fechas
 * automaticas o no tiene ninguna fecha. Si no, no hay nada que recalcular y
 * se ahorra cargar el proyecto entero. Los ancestros son los segmentos del
 * propio `path`: se cruzan por igualdad de ids, nunca por prefijo.
 */
async function anythingToSchedule(executor: DbOrTx, seeds: string[]) {
  const result = await executor.execute(sql`
    SELECT 1
    FROM "task" t
    CROSS JOIN LATERAL unnest(
      string_to_array(trim(both '/' from t."path"), '/')
    ) AS ancestor(id)
    JOIN "task" a ON a."id" = ancestor.id
    WHERE t."id" = ANY(${sql.param(seeds)}::text[])
      AND (
        a."auto_dates"
        OR (a."start_date" IS NULL AND a."due_date" IS NULL AND a."id" <> t."id")
      )
    LIMIT 1
  `);
  return result.rows.length > 0;
}

/**
 * Recalcula las fechas automaticas de un proyecto a partir de las tareas que
 * cambiaron (`seeds`) y las escribe. Da por hecho que quien llama tiene el
 * cerrojo del proyecto: lee el estado ya dentro de la transaccion.
 */
export async function rescheduleProject(
  tx: Tx,
  projectId: string,
  seeds: string[],
): Promise<ScheduleChange[]> {
  if (seeds.length === 0) return [];
  if (!(await anythingToSchedule(tx, seeds))) return [];
  const project = await loadProject(tx, projectId);
  if (!project) return [];

  const [rows, calendar] = await Promise.all([
    tx
      .select({
        id: taskTable.id,
        parentId: taskTable.parentId,
        startDate: taskTable.startDate,
        dueDate: taskTable.dueDate,
        autoDates: taskTable.autoDates,
        isMilestone: taskTable.isMilestone,
        status: taskTable.status,
      })
      .from(taskTable)
      .where(eq(taskTable.projectId, projectId)),
    loadWorkCalendar(project.workspaceId, tx),
  ]);

  let changes: ScheduleChange[];
  try {
    changes = computeSchedule({
      tasks: rows.map((row) => ({
        id: row.id,
        parentId: row.parentId,
        startDate: row.startDate,
        dueDate: row.dueDate,
        autoDates: row.autoDates,
        isMilestone: row.isMilestone,
        archived: row.status === "archived",
      })),
      calendar,
      seeds,
    });
  } catch (error) {
    if (error instanceof ScheduleCycleError) {
      throw new HTTPException(409, { message: error.message });
    }
    throw error;
  }

  for (const change of changes) {
    await tx
      .update(taskTable)
      .set(change.after)
      .where(eq(taskTable.id, change.id));
  }
  return changes;
}

/**
 * Publica lo que movio la planificacion como efecto secundario de `origin`
 * (`cascadedFrom`): deja actividad y refresca las vistas, pero no avisa a
 * nadie ni dispara automatizaciones, igual que una cascada de estados.
 */
export async function publishScheduleChanges(
  changes: ScheduleChange[],
  {
    projectId,
    actorId,
    origin,
  }: { projectId: string; actorId: string; origin: string },
) {
  if (changes.length === 0) return;
  const titles = await db
    .select({
      id: taskTable.id,
      title: taskTable.title,
      status: taskTable.status,
    })
    .from(taskTable)
    .where(
      inArray(
        taskTable.id,
        changes.map((change) => change.id),
      ),
    );
  const byId = new Map(titles.map((row) => [row.id, row]));

  for (const change of changes) {
    const task = byId.get(change.id);
    const sameDue =
      (change.before.dueDate?.getTime() ?? null) ===
      (change.after.dueDate?.getTime() ?? null);
    const sameStart =
      (change.before.startDate?.getTime() ?? null) ===
      (change.after.startDate?.getTime() ?? null);
    if (!sameStart) {
      await publishEvent("task.start_date_changed", {
        taskId: change.id,
        projectId,
        userId: actorId,
        oldStartDate: change.before.startDate,
        newStartDate: change.after.startDate,
        type: "start_date_changed",
        cascadedFrom: origin,
      });
    }
    if (!sameDue) {
      await publishEvent("task.due_date_changed", {
        taskId: change.id,
        projectId,
        userId: actorId,
        oldDueDate: change.before.dueDate,
        newDueDate: change.after.dueDate,
        title: task?.title ?? "",
        type: "due_date_changed",
        cascadedFrom: origin,
      });
    }
    if (change.before.autoDates !== change.after.autoDates) {
      await publishEvent("task.auto_dates_changed", {
        taskId: change.id,
        projectId,
        userId: actorId,
        autoDates: change.after.autoDates,
        type: "auto_dates_changed",
        cascadedFrom: origin,
      });
    }
    await publishEvent("task.updated", {
      taskId: change.id,
      projectId,
      title: task?.title ?? "",
      status: task?.status ?? "",
      userId: actorId,
      cascadedFrom: origin,
    });
  }
}

/**
 * Lo que llaman los controladores despues de escribir fechas, estados o el
 * arbol: recalcula bajo el cerrojo del proyecto y publica lo que se movio.
 * Devuelve los cambios por si quien llama quiere contarlos.
 */
export async function scheduleAfter({
  projectId,
  taskIds,
  actorId,
  origin = taskIds[0] ?? "",
}: {
  projectId: string;
  taskIds: Array<string | null | undefined>;
  actorId: string;
  origin?: string;
}) {
  const seeds = [...new Set(taskIds.filter((id): id is string => Boolean(id)))];
  if (seeds.length === 0) return [];
  const changes = await db.transaction(async (tx) => {
    await lockProjectTree(tx, projectId);
    return rescheduleProject(tx, projectId, seeds);
  });
  await publishScheduleChanges(changes, { projectId, actorId, origin });
  return changes;
}
