import { eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import {
  activityTable,
  projectTable,
  taskTable,
  userTable,
} from "../../database/schema";
import { publishEvent } from "../../events";
import createNotification from "../../notification/controllers/create-notification";
import {
  taskAudience,
  watchBecauseInvolved,
} from "../../task-watcher/watchers";
import { filterAssignableUsers } from "../../utils/assert-assignable-user";
import { parseMentionIds } from "../../utils/parse-mentions";

async function createComment(
  taskId: string,
  userId: string,
  content: string,
  external?: { userName: string; source: string },
) {
  const [activity] = await db
    .insert(activityTable)
    .values({
      taskId,
      type: "comment",
      userId,
      content,
      ...(external
        ? {
            externalUserName: external.userName,
            externalSource: external.source,
          }
        : {}),
    })
    .returning();

  if (!activity) {
    throw new HTTPException(500, {
      message: "Failed to create activity",
    });
  }

  const [user] = await db
    .select({ name: userTable.name })
    .from(userTable)
    .where(eq(userTable.id, userId));

  const [task] = await db
    .select({
      projectId: taskTable.projectId,
      title: taskTable.title,
      workspaceId: projectTable.workspaceId,
    })
    .from(taskTable)
    .innerJoin(projectTable, eq(taskTable.projectId, projectTable.id))
    .where(eq(taskTable.id, taskId));

  if (task) {
    await publishEvent("comment.created", {
      ...activity,
      comment: `**${user?.name}** commented:\n> ${content}`,
      projectId: task.projectId,
    });
  }

  // Notify any workspace members @mentioned in the comment (not the author).
  const mentionedIds = parseMentionIds(content).filter((id) => id !== userId);
  for (const mentionedId of mentionedIds) {
    await createNotification({
      userId: mentionedId,
      type: "task_mention",
      eventData: {
        taskTitle: task?.title ?? null,
        mentionerName: user?.name ?? null,
        projectId: task?.projectId ?? null,
        workspaceId: task?.workspaceId ?? null,
      },
      resourceId: taskId,
      resourceType: "task",
    });
  }

  // Un comentario importado (PLANKA, Trello, Jira) ni avisa ni hace observar:
  // lo importado no avisa (ADR 076), y quinientos comentarios serian quinientos
  // avisos por persona.
  if (!task || external) return activity;

  // A los asignados y a quien observa (ADR 076); antes, solo al responsable
  // principal. Quien sale mencionado ya recibio la mencion.
  const audience = await taskAudience(taskId, [userId, ...mentionedIds]);
  for (const { userId: recipientId, reason } of audience) {
    await createNotification({
      userId: recipientId,
      type: "task_comment",
      eventData: {
        taskTitle: task.title,
        commenterName: user?.name ?? null,
        commentPreview: content.slice(0, 160),
        projectId: task.projectId,
        workspaceId: task.workspaceId,
        reason,
      },
      resourceId: taskId,
      resourceType: "task",
    });
  }

  // Quien comenta entra en la conversacion, y quien sale mencionado la sigue.
  // Una mencion puede traer cualquier id: solo cuentan los del espacio.
  const members = await filterAssignableUsers(mentionedIds, task.workspaceId);
  await watchBecauseInvolved({
    taskId,
    projectId: task.projectId,
    actorId: userId,
    userIds: [userId, ...mentionedIds.filter((id) => members.has(id))],
  });

  return activity;
}

export default createComment;
