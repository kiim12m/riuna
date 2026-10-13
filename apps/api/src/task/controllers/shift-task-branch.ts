import { and, eq, like } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { projectTable, taskTable } from "../../database/schema";
import { publishEvent } from "../../events";
import type { ScheduleChange } from "../schedule/compute-schedule";
import {
  publishScheduleChanges,
  rescheduleProject,
} from "../schedule/reschedule";
import { loadWorkCalendar } from "../schedule/work-calendar";
import { subtreePattern } from "../tree";
import { lockProjectTree } from "./lock-project-tree";

/**
 * Mueve una tarea y toda su rama los mismos dias laborables (ADR 083): lo que
 * hace arrastrar un padre en el Gantt. En una transaccion y bajo el cerrojo
 * del proyecto, y despues se replanifica lo que cuelgue de ella —las fechas
 * automaticas de sus ancestros y, con la 2.3, sus sucesoras—.
 */
async function shiftTaskBranch({
  id,
  workDays: requestedWorkDays,
  toStartDate,
  currentUserId,
}: {
  id: string;
  workDays?: number;
  /** Mover la rama para que la tarea empiece ese dia (lo que manda el Gantt). */
  toStartDate?: Date;
  currentUserId: string;
}) {
  const [root] = await db
    .select({
      projectId: taskTable.projectId,
      workspaceId: projectTable.workspaceId,
    })
    .from(taskTable)
    .innerJoin(projectTable, eq(taskTable.projectId, projectTable.id))
    .where(eq(taskTable.id, id))
    .limit(1);
  if (!root) throw new HTTPException(404, { message: "Task not found" });

  const result = await db.transaction(async (tx) => {
    await lockProjectTree(tx, root.projectId);
    const calendar = await loadWorkCalendar(root.workspaceId, tx);

    // Releida ya con el cerrojo. La rama, con un patron constante que si usa
    // el indice de `path`.
    const [self] = await tx
      .select({
        path: taskTable.path,
        startDate: taskTable.startDate,
        dueDate: taskTable.dueDate,
      })
      .from(taskTable)
      .where(eq(taskTable.id, id))
      .limit(1);
    if (!self) throw new HTTPException(404, { message: "Task not found" });

    const anchor = self.startDate ?? self.dueDate;
    const workDays =
      requestedWorkDays ??
      (toStartDate && anchor
        ? calendar.workDaysToward(anchor, toStartDate)
        : 0);
    if (workDays === 0) return null;

    const branch = await tx
      .select({
        id: taskTable.id,
        startDate: taskTable.startDate,
        dueDate: taskTable.dueDate,
        autoDates: taskTable.autoDates,
      })
      .from(taskTable)
      .where(
        and(
          eq(taskTable.projectId, root.projectId),
          like(taskTable.path, subtreePattern(self.path)),
        ),
      );

    const shifted: ScheduleChange[] = [];
    for (const task of branch) {
      if (!task.startDate && !task.dueDate) continue;
      const after = {
        startDate: task.startDate
          ? calendar.addWorkDays(task.startDate, workDays)
          : null,
        dueDate: task.dueDate
          ? calendar.addWorkDays(task.dueDate, workDays)
          : null,
        autoDates: task.autoDates,
      };
      await tx
        .update(taskTable)
        .set({ startDate: after.startDate, dueDate: after.dueDate })
        .where(eq(taskTable.id, task.id));
      shifted.push({
        id: task.id,
        before: {
          startDate: task.startDate,
          dueDate: task.dueDate,
          autoDates: task.autoDates,
        },
        after,
      });
    }

    const scheduled = await rescheduleProject(
      tx,
      root.projectId,
      branch.map((task) => task.id),
    );
    return { workDays, shifted, scheduled };
  });

  if (!result || result.shifted.length === 0) return { moved: 0 };

  await publishEvent("task.branch_shifted", {
    taskId: id,
    projectId: root.projectId,
    userId: currentUserId,
    workDays: result.workDays,
    moved: result.shifted.length,
    type: "branch_shifted",
  });

  // Lo movido y lo que arrastro, como efecto secundario del gesto sobre la
  // raiz: deja actividad, pero no avisa ni dispara automatizaciones. Si la
  // replanificacion volvio a tocar una tarea movida, cuenta desde el origen.
  const byId = new Map<string, ScheduleChange>();
  for (const change of [...result.shifted, ...result.scheduled]) {
    const previous = byId.get(change.id);
    byId.set(
      change.id,
      previous ? { ...change, before: previous.before } : change,
    );
  }
  await publishScheduleChanges([...byId.values()], {
    projectId: root.projectId,
    actorId: currentUserId,
    origin: id,
  });

  return { moved: result.shifted.length };
}

export default shiftTaskBranch;
