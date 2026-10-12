import { HTTPException } from "hono/http-exception";
import type { EditableCondition } from "../view/filter-schema";
import { taskMatchesConditions } from "./condition";
import type { Action } from "./definition";
import { candidateRules } from "./engine";
import { ruleActorCanRun } from "./permissions";
import { executeRule, pauseRule, recordRun } from "./run";
import { loadTaskInfo, type TaskInfo } from "./task-info";

// Las acciones de un clic (ADR 078): una regla con el disparador `manual` sale
// como boton en la tarea cuando esta cumple su «Si», y corre sus «Entonces»
// en nombre de quien pulsa.

type AutomationRow = Awaited<ReturnType<typeof candidateRules>>[number];

async function applies(rule: AutomationRow, task: TaskInfo) {
  try {
    return await taskMatchesConditions({
      taskId: task.id,
      workspaceId: rule.workspaceId,
      projectId: rule.projectId,
      conditions: rule.conditions as EditableCondition[],
    });
  } catch {
    // Una condicion que ya no compila (un campo borrado) no ofrece el boton.
    return false;
  }
}

async function loadTask(taskId: string) {
  const task = await loadTaskInfo(taskId);
  if (!task) throw new HTTPException(404, { message: "Task not found" });
  return task;
}

/** Los botones que ofrece la tarea ahora mismo, en el orden de las reglas. */
export async function listManualActions(taskId: string) {
  const task = await loadTask(taskId);
  const rules = await candidateRules(task.projectId, "manual");
  const offered: { id: string; name: string }[] = [];
  for (const rule of rules) {
    if (await applies(rule, task)) {
      offered.push({ id: rule.id, name: rule.name });
    }
  }
  return offered;
}

/** Si pulsarla reparte la tarea: entonces pide tambien `task:assign`. */
export function assignsWork(rule: { actions: unknown }) {
  return (rule.actions as Action[]).some(
    (action) =>
      action.type === "assign_users" ||
      action.type === "assign_team" ||
      (action.type === "create_task" && (action.assigneeIds?.length ?? 0) > 0),
  );
}

/**
 * Corre una accion de un clic. La regla tiene que ser de las que la tarea
 * ofrece ahora —activa, de su proyecto o de su espacio, y con su «Si»
 * cumplido—, y quien la guardo tiene que seguir pudiendo, como en las que
 * disparan solas (ADR 067).
 */
export async function runManualAction({
  automationId,
  taskId,
  userId,
}: {
  automationId: string;
  taskId: string;
  userId: string;
}) {
  const task = await loadTask(taskId);
  const rules = await candidateRules(task.projectId, "manual");
  const rule = rules.find((candidate) => candidate.id === automationId);
  if (!rule) {
    throw new HTTPException(404, {
      message: "This action is not available on this task",
    });
  }

  if (!(await ruleActorCanRun(rule))) {
    await pauseRule(rule, "actor_lost_permission");
    await recordRun({
      rule,
      taskId: task.id,
      status: "skipped",
      detail: {
        event: "manual",
        pressedBy: userId,
        reason: "actor_lost_permission",
      },
    });
    throw new HTTPException(409, {
      message: "Whoever saved this action can no longer run it",
    });
  }

  if (!(await applies(rule, task))) {
    throw new HTTPException(409, {
      message: "The task no longer meets this action's conditions",
    });
  }

  return executeRule({
    rule,
    task,
    actorId: userId,
    chain: [rule.id],
    eventType: "manual",
    pressedBy: userId,
  });
}
