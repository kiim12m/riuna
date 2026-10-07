import { and, asc, eq } from "drizzle-orm";
import db from "../../database";
import { columnTable, taskAssigneeTable } from "../../database/schema";
import assignLabelToTask from "../../label/controllers/assign-label-to-task";
import completeTask from "../../task/controllers/complete-task";
import createTask from "../../task/controllers/create-task";
import updateTaskAssignees from "../../task/controllers/update-task-assignees";
import updateTaskCustomFields from "../../task/controllers/update-task-custom-fields";
import updateTaskDueDate from "../../task/controllers/update-task-due-date";
import updateTaskPriority from "../../task/controllers/update-task-priority";
import updateTaskStatus from "../../task/controllers/update-task-status";
import updateTaskTeam from "../../task/controllers/update-task-team";
import { addDays, startOfServerDay } from "../../utils/day-boundaries";
import type { Action } from "../definition";
import { renderTemplate } from "../task-info";
import type { ActionContext, ActionOutcome } from "./types";

type InternalAction = Exclude<Action, { type: "notify" | "webhook" | "chat" }>;

// Cada accion es un envoltorio fino del controlador que ya usa la interfaz,
// asi que publica los mismos eventos y deja la misma actividad. Lo que ya esta
// como la accion quiere se deja quieto: un evento de mas es un disparo de mas.

export async function currentAssignees(taskId: string) {
  const rows = await db
    .select({ userId: taskAssigneeTable.userId })
    .from(taskAssigneeTable)
    .where(eq(taskAssigneeTable.taskId, taskId))
    .orderBy(asc(taskAssigneeTable.createdAt));
  return rows.map((row) => row.userId);
}

async function firstColumnSlug(projectId: string) {
  const [column] = await db
    .select({ slug: columnTable.slug })
    .from(columnTable)
    .where(eq(columnTable.projectId, projectId))
    .orderBy(asc(columnTable.position))
    .limit(1);
  return column?.slug ?? "to-do";
}

export async function runInternalAction(
  action: InternalAction,
  { task, actorId }: ActionContext,
): Promise<ActionOutcome> {
  const base = { id: task.id, currentUserId: actorId };

  switch (action.type) {
    case "move": {
      const [column] = await db
        .select({ slug: columnTable.slug })
        .from(columnTable)
        .where(
          and(
            eq(columnTable.id, action.columnId),
            eq(columnTable.projectId, task.projectId),
          ),
        )
        .limit(1);
      if (!column) throw new Error("The column no longer exists");
      if (column.slug === task.status) return { unchanged: true };
      await updateTaskStatus({ ...base, status: column.slug });
      return;
    }
    case "complete":
      await completeTask({ ...base, done: action.done });
      return;
    case "priority":
      if (action.priority === task.priority) return { unchanged: true };
      await updateTaskPriority({ ...base, priority: action.priority });
      return;
    case "due_date":
      await updateTaskDueDate({
        ...base,
        dueDate:
          action.days === null
            ? null
            : startOfServerDay(addDays(new Date(), action.days)),
      });
      return;
    case "custom_field":
      await updateTaskCustomFields({
        ...base,
        values: { [action.fieldKey]: action.value },
      });
      return;
    case "label":
      await assignLabelToTask(action.labelId, task.id, actorId);
      return;
    case "assign_users": {
      const current = await currentAssignees(task.id);
      const next =
        action.mode === "replace"
          ? action.userIds
          : action.mode === "add"
            ? [
                ...current,
                ...action.userIds.filter((id) => !current.includes(id)),
              ]
            : current.filter((id) => !action.userIds.includes(id));
      const same =
        next.length === current.length &&
        next.every((id) => current.includes(id));
      if (same) return { unchanged: true };
      await updateTaskAssignees({ ...base, userIds: next });
      return;
    }
    case "assign_team":
      if (action.teamId === task.teamId) return { unchanged: true };
      await updateTaskTeam({ ...base, teamId: action.teamId });
      return;
    case "create_task": {
      const [first, ...rest] = action.assigneeIds ?? [];
      const created = await createTask({
        projectId: task.projectId,
        currentUserId: actorId,
        userId: first,
        title: renderTemplate(action.title, task),
        status: await firstColumnSlug(task.projectId),
        parentId: action.asSubtask ? task.id : null,
      });
      if (first && rest.length > 0) {
        await updateTaskAssignees({
          id: created.id,
          userIds: [first, ...rest],
          currentUserId: actorId,
        });
      }
      return { taskId: created.id };
    }
  }
}
