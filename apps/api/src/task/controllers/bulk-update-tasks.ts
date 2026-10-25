import { and, eq, inArray, or } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import {
  assetTable,
  columnTable,
  labelTable,
  projectTable,
  taskAssigneeTable,
  taskRelationTable,
  taskTable,
  userTable,
  workspaceUserTable,
} from "../../database/schema";
import { publishEvent } from "../../events";
import { refreshFormulasAfter } from "../../field/formula/refresh";
import { removeLabelFromGitea } from "../../plugins/gitea/utils/sync-label-to-gitea";
import { removeLabelFromGitHub } from "../../plugins/github/utils/sync-label-to-github";
import { deleteS3Keys } from "../../storage/cleanup-assets";
import { assertAssignableUser } from "../../utils/assert-assignable-user";
import { log } from "../../utils/log";
import { scheduleAfter } from "../schedule/reschedule";
import {
  assertValidPriority,
  assertValidTaskStatus,
} from "../validate-task-fields";
import { syncPrimaryAssigneeBulk } from "./assignees";
import { cascadeStatusToSubtrees } from "./cascade-status";
import { deleteTasksPromotingChildren } from "./delete-tasks-promoting-children";
import { lockProjectTree } from "./lock-project-tree";

type BulkOperation =
  | "updateStatus"
  | "updatePriority"
  | "updateAssignee"
  | "delete"
  | "addLabel"
  | "removeLabel"
  | "updateDueDate";

async function bulkUpdateTasks({
  taskIds,
  operation,
  value,
  userId,
}: {
  taskIds: string[];
  operation: BulkOperation;
  value?: string | null;
  userId: string;
}) {
  const tasks = await db
    .select({
      id: taskTable.id,
      title: taskTable.title,
      status: taskTable.status,
      projectId: taskTable.projectId,
      path: taskTable.path,
      userId: taskTable.userId,
      dueDate: taskTable.dueDate,
      parentId: taskTable.parentId,
      teamId: taskTable.teamId,
      workspaceId: projectTable.workspaceId,
    })
    .from(taskTable)
    .innerJoin(projectTable, eq(taskTable.projectId, projectTable.id))
    .where(inArray(taskTable.id, taskIds));

  if (tasks.length === 0) {
    throw new HTTPException(404, {
      message: "No tasks found",
    });
  }

  const workspaceIds = [...new Set(tasks.map((t) => t.workspaceId))];

  if (workspaceIds.length > 1) {
    throw new HTTPException(400, {
      message: "All tasks must belong to the same workspace",
    });
  }

  const workspaceId = workspaceIds[0];

  if (!workspaceId) {
    throw new HTTPException(400, {
      message: "Could not determine workspace",
    });
  }

  const [membership] = await db
    .select({ id: workspaceUserTable.id })
    .from(workspaceUserTable)
    .where(
      and(
        eq(workspaceUserTable.userId, userId),
        eq(workspaceUserTable.workspaceId, workspaceId),
      ),
    )
    .limit(1);

  if (!membership) {
    throw new HTTPException(403, {
      message: "You don't have access to this workspace",
    });
  }

  const foundIds = tasks.map((t) => t.id);
  let updatedCount = 0;
  // Las madres de lo borrado, que es lo que hay que replanificar.
  const deleteSeeds: { projectId: string; id: string }[] = [];

  switch (operation) {
    case "updateStatus": {
      if (!value) {
        throw new HTTPException(400, { message: "Status value is required" });
      }
      const projectIds = [...new Set(tasks.map((t) => t.projectId))];

      for (const projectId of projectIds) {
        await assertValidTaskStatus(value, projectId);

        const column = await db.query.columnTable.findFirst({
          where: and(
            eq(columnTable.projectId, projectId),
            eq(columnTable.slug, value),
          ),
        });

        const projectTaskIds = tasks
          .filter((t) => t.projectId === projectId)
          .map((t) => t.id);

        const result = await db
          .update(taskTable)
          .set({ status: value, columnId: column?.id ?? null })
          .where(inArray(taskTable.id, projectTaskIds));

        updatedCount += result.rowCount ?? projectTaskIds.length;

        // Solo las que cambian, y con su estado anterior: ahora avisan a sus
        // asignados y a quien observa (ADR 076), y una tarea que ya estaba en
        // esa columna no ha cambiado de nada.
        for (const task of tasks) {
          if (task.projectId !== projectId || task.status === value) continue;
          await publishEvent("task.status_changed", {
            taskId: task.id,
            projectId,
            userId,
            oldStatus: task.status,
            newStatus: value,
            title: task.title,
            type: "status_changed",
          });
        }

        // Cerrar o archivar en lote baja por la rama igual que tarea a tarea,
        // si el proyecto tiene la cascada encendida (ADR 011). Las que ya
        // movio la cascada de una madre seleccionada no vuelven a moverse.
        await cascadeStatusToSubtrees({
          tasks: tasks.filter((t) => t.projectId === projectId),
          projectId,
          status: value,
          currentUserId: userId,
        });

        await publishEvent("task-relation.refresh", {
          projectId,
          userId,
        });
      }
      break;
    }

    case "updatePriority": {
      if (!value) {
        throw new HTTPException(400, { message: "Priority value is required" });
      }
      assertValidPriority(value);

      const result = await db
        .update(taskTable)
        .set({ priority: value })
        .where(inArray(taskTable.id, foundIds));

      updatedCount = result.rowCount ?? foundIds.length;

      for (const task of tasks) {
        await publishEvent("task.priority_changed", {
          taskId: task.id,
          projectId: task.projectId,
          userId,
          newPriority: value,
          type: "priority_changed",
        });
      }
      break;
    }

    case "updateAssignee": {
      const assigneeId = value?.trim() || null;

      if (assigneeId) {
        await assertAssignableUser(assigneeId, workspaceId);
      }

      const newAssigneeName = assigneeId
        ? (
            await db
              .select({ name: userTable.name })
              .from(userTable)
              .where(eq(userTable.id, assigneeId))
              .limit(1)
          )[0]?.name
        : undefined;

      const result = await db.transaction(async (tx) => {
        const updated = await tx
          .update(taskTable)
          .set({ userId: assigneeId })
          .where(inArray(taskTable.id, foundIds));

        await syncPrimaryAssigneeBulk(tasks, assigneeId, tx);

        return updated;
      });

      updatedCount = result.rowCount ?? foundIds.length;

      // Los mismos campos que `update-task-assignee.ts`: quitar lleva
      // `previousAssigneeId`, que es lo que leen la actividad, "Mi trabajo" y
      // la linea base; con `oldAssignee` se perdia a quien se quito.
      for (const task of tasks) {
        if (!assigneeId) {
          await publishEvent("task.unassigned", {
            taskId: task.id,
            projectId: task.projectId,
            userId,
            previousAssigneeId: task.userId,
            title: task.title,
            type: "unassigned",
          });
          continue;
        }
        await publishEvent("task.assignee_changed", {
          taskId: task.id,
          projectId: task.projectId,
          userId,
          oldAssignee: task.userId,
          newAssignee: newAssigneeName,
          newAssigneeId: assigneeId,
          title: task.title,
          type: "assignee_changed",
        });
      }
      break;
    }

    case "delete": {
      // Lo que ya no se podra leer cuando las filas no existan: a quien hay que
      // refrescarle "Mi trabajo", sus relaciones y sus ficheros.
      const assignees = await db
        .select({
          taskId: taskAssigneeTable.taskId,
          userId: taskAssigneeTable.userId,
        })
        .from(taskAssigneeTable)
        .where(inArray(taskAssigneeTable.taskId, foundIds));
      const relations = await db
        .select()
        .from(taskRelationTable)
        .where(
          or(
            inArray(taskRelationTable.sourceTaskId, foundIds),
            inArray(taskRelationTable.targetTaskId, foundIds),
          ),
        );
      const assetKeys = (
        await db
          .select({ objectKey: assetTable.objectKey })
          .from(assetTable)
          .where(inArray(assetTable.taskId, foundIds))
      ).map((asset) => asset.objectKey);

      const removed = await db.transaction(async (tx) => {
        // Siempre en el mismo orden, para que dos lotes no se interbloqueen.
        for (const projectId of [
          ...new Set(tasks.map((t) => t.projectId)),
        ].sort()) {
          await lockProjectTree(tx, projectId);
        }
        return deleteTasksPromotingChildren(tx, foundIds);
      });

      updatedCount = removed.length;
      const removedIds = new Set(removed.map((row) => row.id));
      for (const row of removed) {
        // La madre que tenia al irse, si no se fue con ella: su rama encoge.
        if (row.parentId && !removedIds.has(row.parentId)) {
          deleteSeeds.push({ projectId: row.projectId, id: row.parentId });
        }
      }

      for (const task of tasks) {
        if (!removedIds.has(task.id)) continue;
        await publishEvent("task.deleted", {
          taskId: task.id,
          projectId: task.projectId,
          userId,
          title: task.title,
          assigneeIds: assignees
            .filter((assignee) => assignee.taskId === task.id)
            .map((assignee) => assignee.userId),
          teamId: task.teamId,
        });
      }

      for (const relation of relations) {
        const task = tasks.find(
          (t) =>
            t.id === relation.sourceTaskId || t.id === relation.targetTaskId,
        );
        if (!task) continue;
        await publishEvent("task-relation.deleted", {
          projectId: task.projectId,
          userId,
          taskId: task.id,
          sourceTaskId: relation.sourceTaskId,
          targetTaskId: relation.targetTaskId,
        });
      }

      if (assetKeys.length > 0) {
        deleteS3Keys(assetKeys).catch(() => {});
      }
      break;
    }

    case "addLabel": {
      if (!value) {
        throw new HTTPException(400, { message: "Label ID is required" });
      }

      const label = await db.query.labelTable.findFirst({
        where: eq(labelTable.id, value),
      });

      if (!label) {
        throw new HTTPException(404, { message: "Label not found" });
      }

      if (label.workspaceId && label.workspaceId !== workspaceId) {
        throw new HTTPException(400, {
          message: "Label and tasks must belong to the same workspace",
        });
      }

      for (const task of tasks) {
        const existingAssignment = await db.query.labelTable.findFirst({
          where: and(
            eq(labelTable.name, label.name),
            eq(labelTable.taskId, task.id),
          ),
        });

        if (!existingAssignment) {
          await db
            .insert(labelTable)
            .values({
              name: label.name,
              color: label.color,
              workspaceId: workspaceId,
              taskId: task.id,
            })
            .onConflictDoNothing({
              target: [labelTable.taskId, labelTable.name],
            });
          updatedCount++;

          await publishEvent("task.label_assigned", {
            projectId: task.projectId,
            taskId: task.id,
            userId,
            type: "label_assigned",
          });
        }
      }
      break;
    }

    case "removeLabel": {
      if (!value) {
        throw new HTTPException(400, { message: "Label ID is required" });
      }

      const label = await db.query.labelTable.findFirst({
        where: eq(labelTable.id, value),
      });

      if (!label) {
        throw new HTTPException(404, { message: "Label not found" });
      }

      const deletedLabels = await db
        .delete(labelTable)
        .where(
          and(
            eq(labelTable.workspaceId, workspaceId),
            eq(labelTable.name, label.name),
            inArray(labelTable.taskId, foundIds),
          ),
        )
        .returning();

      updatedCount = deletedLabels.length;

      for (const deletedLabel of deletedLabels) {
        if (!deletedLabel.taskId) continue;

        removeLabelFromGitHub(deletedLabel.taskId, deletedLabel.name).catch(
          (error) => {
            log.error("Failed to remove label from GitHub:", error);
          },
        );
        removeLabelFromGitea(deletedLabel.taskId, deletedLabel.name).catch(
          (error) => {
            log.error("Failed to remove label from Gitea:", error);
          },
        );

        const task = tasks.find((t) => t.id === deletedLabel.taskId);
        if (!task) continue;

        await publishEvent("task.label_unassigned", {
          label: deletedLabel,
          task,
          projectId: task.projectId,
          taskId: deletedLabel.taskId,
          userId,
          type: "label_unassigned",
        });
      }
      break;
    }

    case "updateDueDate": {
      let parsedDate: Date | null = null;
      if (value) {
        parsedDate = new Date(value);
        if (Number.isNaN(parsedDate.getTime())) {
          throw new HTTPException(400, {
            message: `Invalid date value "${value}"`,
          });
        }
      }

      const result = await db
        .update(taskTable)
        .set({ dueDate: parsedDate })
        .where(inArray(taskTable.id, foundIds));

      updatedCount = result.rowCount ?? foundIds.length;

      for (const task of tasks) {
        await publishEvent("task.due_date_changed", {
          taskId: task.id,
          projectId: task.projectId,
          userId,
          oldDueDate: task.dueDate,
          newDueDate: parsedDate,
          title: task.title,
          type: "due_date_changed",
        });
      }
      break;
    }

    default: {
      throw new HTTPException(400, {
        message: `Unknown operation "${operation}"`,
      });
    }
  }

  // Lo que mueve fechas automaticas (ADR 083): vencimientos, archivar y
  // borrar. Una replanificacion por proyecto, no por tarea.
  if (
    operation === "updateDueDate" ||
    operation === "delete" ||
    (operation === "updateStatus" &&
      (value === "archived" || tasks.some((t) => t.status === "archived")))
  ) {
    const byProject = new Map<string, string[]>();
    const seeds =
      operation === "delete"
        ? deleteSeeds
        : tasks.map((task) => ({ projectId: task.projectId, id: task.id }));
    for (const seed of seeds) {
      byProject.set(seed.projectId, [
        ...(byProject.get(seed.projectId) ?? []),
        seed.id,
      ]);
    }
    for (const [projectId, taskIds] of byProject) {
      await scheduleAfter({ projectId, taskIds, actorId: userId });
      // Archivar y borrar cambian lo que suma cada rama (ADR 090).
      if (operation !== "updateDueDate") {
        await refreshFormulasAfter({ projectId, taskIds });
      }
    }
  }

  return { success: true, updatedCount };
}

export default bulkUpdateTasks;
