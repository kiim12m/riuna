import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import * as v from "valibot";
import db from "../database";
import { projectTable, taskTable, teamMemberTable } from "../database/schema";
import { subscribeToEvent } from "../events";
import { notificationSchema } from "../schemas";
import clearNotifications from "./controllers/clear-notifications";
import createNotification from "./controllers/create-notification";
import getNotifications, {
  getUnreadNotificationCount,
  MAX_NOTIFICATIONS_PAGE,
} from "./controllers/get-notifications";
import markAllNotificationsAsRead from "./controllers/mark-all-notifications-as-read";
import markAsRead from "./controllers/mark-notification-as-read";

const bulkResultSchema = v.object({
  success: v.boolean(),
  count: v.optional(v.number()),
});

const notification = new Hono<{
  Variables: {
    userId: string;
  };
}>()
  .get(
    "/",
    describeRoute({
      operationId: "listNotifications",
      tags: ["Notifications"],
      description:
        "The current user's notifications, newest first: 50 by default. `limit` (1-100) sizes the page, `before` (an ISO instant, the `createdAt` of the last one received) with `beforeId` (its `id`) asks for the next without skipping or repeating any, and `unread` keeps only the unread",
      responses: {
        200: {
          description: "List of notifications",
          content: {
            "application/json": {
              schema: resolver(v.array(notificationSchema)),
            },
          },
        },
      },
    }),
    validator(
      "query",
      v.object({
        limit: v.optional(
          v.pipe(
            v.string(),
            v.transform(Number),
            v.integer(),
            v.minValue(1),
            v.maxValue(MAX_NOTIFICATIONS_PAGE),
          ),
        ),
        before: v.optional(
          v.pipe(
            v.string(),
            v.isoTimestamp(),
            v.transform((value) => new Date(value)),
          ),
        ),
        beforeId: v.optional(
          v.pipe(v.string(), v.minLength(1), v.maxLength(255)),
        ),
        unread: v.optional(v.picklist(["true", "false"])),
      }),
    ),
    async (c) => {
      const userId = c.get("userId");
      const { limit, before, beforeId, unread } = c.req.valid("query");
      const notifications = await getNotifications(userId, {
        limit,
        before,
        beforeId,
        unread: unread === "true",
      });
      return c.json(notifications);
    },
  )
  .get(
    "/unread-count",
    describeRoute({
      operationId: "countUnreadNotifications",
      tags: ["Notifications"],
      description:
        "How many unread notifications the current user has, all of them and not just the first page",
      responses: {
        200: {
          description: "The unread count",
          content: {
            "application/json": {
              schema: resolver(v.object({ count: v.number() })),
            },
          },
        },
      },
    }),
    async (c) =>
      c.json({ count: await getUnreadNotificationCount(c.get("userId")) }),
  )
  .post(
    "/",
    describeRoute({
      operationId: "createNotification",
      tags: ["Notifications"],
      description: "Create a new notification for a user",
      responses: {
        200: {
          description: "Notification created successfully",
          content: {
            "application/json": { schema: resolver(notificationSchema) },
          },
        },
      },
    }),
    validator(
      "json",
      v.object({
        title: v.optional(v.nullable(v.string())),
        message: v.optional(v.nullable(v.string())),
        type: v.string(),
        eventData: v.optional(v.nullable(v.record(v.string(), v.unknown()))),
        relatedEntityId: v.optional(v.string()),
        relatedEntityType: v.optional(v.string()),
      }),
    ),
    async (c) => {
      const {
        title,
        message,
        type,
        eventData,
        relatedEntityId,
        relatedEntityType,
      } = c.req.valid("json");
      const userId = c.get("userId");
      const notification = await createNotification({
        userId,
        title,
        content: message,
        type,
        eventData,
        resourceId: relatedEntityId,
        resourceType: relatedEntityType,
      });
      return c.json(notification);
    },
  )
  .patch(
    "/:id/read",
    describeRoute({
      operationId: "markNotificationAsRead",
      tags: ["Notifications"],
      description: "Mark a specific notification as read",
      responses: {
        200: {
          description: "Notification marked as read",
          content: {
            "application/json": { schema: resolver(notificationSchema) },
          },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    async (c) => {
      const { id } = c.req.valid("param");
      const userId = c.get("userId");
      const notification = await markAsRead(id, userId);
      return c.json(notification);
    },
  )
  .patch(
    "/read-all",
    describeRoute({
      operationId: "markAllNotificationsAsRead",
      tags: ["Notifications"],
      description: "Mark all notifications as read for the current user",
      responses: {
        200: {
          description: "All notifications marked as read",
          content: {
            "application/json": { schema: resolver(bulkResultSchema) },
          },
        },
      },
    }),
    async (c) => {
      const userId = c.get("userId");
      const result = await markAllNotificationsAsRead(userId);
      return c.json(result);
    },
  )
  .delete(
    "/clear-all",
    describeRoute({
      operationId: "clearAllNotifications",
      tags: ["Notifications"],
      description: "Clear all notifications for the current user",
      responses: {
        200: {
          description: "All notifications cleared",
          content: {
            "application/json": { schema: resolver(bulkResultSchema) },
          },
        },
      },
    }),
    async (c) => {
      const userId = c.get("userId");
      const result = await clearNotifications(userId);
      return c.json(result);
    },
  );

/**
 * A quien no se avisa: a quien hizo el cambio. Si lo hizo una automatizacion
 * (ADR 067), la persona en cuyo nombre corre no hizo nada, asi que tambien a
 * ella le llega.
 */
function actorToSkip(data: object, actorId: string | undefined) {
  return "automation" in data && data.automation ? undefined : actorId;
}

subscribeToEvent<{
  taskId: string;
  userId: string;
  currentUserId?: string;
  title: string;
  projectId: string;
}>("task.created", async (data) => {
  if (data.userId && data.userId !== actorToSkip(data, data.currentUserId)) {
    const [project] = await db
      .select({ workspaceId: projectTable.workspaceId })
      .from(projectTable)
      .where(eq(projectTable.id, data.projectId))
      .limit(1);

    await createNotification({
      userId: data.userId,
      type: "task_created",
      eventData: {
        taskTitle: data.title,
        projectId: data.projectId,
        workspaceId: project?.workspaceId ?? null,
      },
      resourceId: data.taskId,
      resourceType: "task",
    });
  }
});

subscribeToEvent<{
  workspaceId: string;
  workspaceName: string;
  ownerEmail: string;
  ownerId?: string;
}>("workspace.created", async (data) => {
  if (data.ownerId) {
    await createNotification({
      userId: data.ownerId,
      type: "workspace_created",
      eventData: {
        workspaceName: data.workspaceName,
      },
      resourceId: data.workspaceId,
      resourceType: "workspace",
    });
  }
});

// Avisar es parte del trato: al miembro se le anade sin pedirle permiso, asi
// que al menos se entera de que ahora pertenece a un espacio.
subscribeToEvent<{
  workspaceId: string;
  workspaceName: string;
  userId: string;
}>("workspace.member.added", async (data) => {
  await createNotification({
    userId: data.userId,
    type: "workspace_member_added",
    eventData: {
      workspaceName: data.workspaceName,
    },
    resourceId: data.workspaceId,
    resourceType: "workspace",
  });
});

subscribeToEvent<{
  taskId: string;
  userId: string;
  oldStatus: string;
  newStatus: string;
  title: string;
  assigneeId?: string;
}>("task.status_changed", async (data) => {
  if (data.assigneeId && data.assigneeId !== actorToSkip(data, data.userId)) {
    const [task] = await db
      .select({ projectId: taskTable.projectId })
      .from(taskTable)
      .where(eq(taskTable.id, data.taskId))
      .limit(1);

    const [project] = task
      ? await db
          .select({ workspaceId: projectTable.workspaceId })
          .from(projectTable)
          .where(eq(projectTable.id, task.projectId))
          .limit(1)
      : [];

    await createNotification({
      userId: data.assigneeId,
      type: "task_status_changed",
      eventData: {
        taskTitle: data.title,
        oldStatus: data.oldStatus,
        newStatus: data.newStatus,
        projectId: task?.projectId ?? null,
        workspaceId: project?.workspaceId ?? null,
      },
      resourceId: data.taskId,
      resourceType: "task",
    });
  }
});

subscribeToEvent<{
  taskId: string;
  userId: string;
  oldAssignee: string | null;
  newAssignee: string;
  newAssigneeId: string;
  title: string;
}>("task.assignee_changed", async (data) => {
  if (data.newAssigneeId) {
    const [task] = await db
      .select({ projectId: taskTable.projectId })
      .from(taskTable)
      .where(eq(taskTable.id, data.taskId))
      .limit(1);

    const [project] = task
      ? await db
          .select({ workspaceId: projectTable.workspaceId })
          .from(projectTable)
          .where(eq(projectTable.id, task.projectId))
          .limit(1)
      : [];

    await createNotification({
      userId: data.newAssigneeId,
      type: "task_assignee_changed",
      eventData: {
        taskTitle: data.title,
        projectId: task?.projectId ?? null,
        workspaceId: project?.workspaceId ?? null,
      },
      resourceId: data.taskId,
      resourceType: "task",
    });
  }
});

// La via de asignacion multiple, que es la que usa el detalle de la tarea
// desde la Fase 1. Sin esto, anadir a alguien a una tarea no le avisaba por
// ningun canal: ni in-app, ni correo, ni ntfy, ni Gotify, ni webhook.
//
// Se avisa solo a quien entra (`addedIds`), no al conjunto entero: quitar a una
// persona no puede pingar a las otras cuatro.
subscribeToEvent<{
  taskId: string;
  projectId: string;
  userId: string;
  addedIds: string[];
  title: string;
}>("task.assignees_changed", async (data) => {
  const added = (data.addedIds ?? []).filter(
    (userId) => userId && userId !== actorToSkip(data, data.userId),
  );

  if (added.length === 0) return;

  const [project] = await db
    .select({ workspaceId: projectTable.workspaceId })
    .from(projectTable)
    .where(eq(projectTable.id, data.projectId))
    .limit(1);

  for (const userId of added) {
    await createNotification({
      userId,
      type: "task_assignee_changed",
      eventData: {
        taskTitle: data.title,
        projectId: data.projectId,
        workspaceId: project?.workspaceId ?? null,
      },
      resourceId: data.taskId,
      resourceType: "task",
    });
  }
});

// Asignar a un equipo avisa a sus miembros. Era el requisito que motivo la
// Fase 1 —«repartir trabajo a un departamento entero»— y no notificaba a
// nadie.
//
// Ojo al abanico: un equipo de treinta personas son treinta notificaciones y
// treinta entregas. Se reutiliza `task_assignee_changed` a proposito, para que
// respete la preferencia de asignacion que la gente ya tiene configurada en
// vez de estrenar un tipo que nadie ha activado.
subscribeToEvent<{
  taskId: string;
  projectId: string;
  userId: string;
  newTeamId: string;
  title: string;
}>("task.team_changed", async (data) => {
  if (!data.newTeamId) return;

  const members = await db
    .select({ userId: teamMemberTable.userId })
    .from(teamMemberTable)
    .where(eq(teamMemberTable.teamId, data.newTeamId));

  const recipients = members
    .map((member) => member.userId)
    .filter((userId) => userId && userId !== actorToSkip(data, data.userId));

  if (recipients.length === 0) return;

  const [project] = await db
    .select({ workspaceId: projectTable.workspaceId })
    .from(projectTable)
    .where(eq(projectTable.id, data.projectId))
    .limit(1);

  for (const userId of recipients) {
    await createNotification({
      userId,
      type: "task_assignee_changed",
      eventData: {
        taskTitle: data.title,
        projectId: data.projectId,
        workspaceId: project?.workspaceId ?? null,
      },
      resourceId: data.taskId,
      resourceType: "task",
    });
  }
});

subscribeToEvent<{
  timeEntryId: string;
  taskId: string;
  userId: string;
  taskOwnerId?: string;
  taskTitle?: string;
}>("time-entry.created", async (data) => {
  if (data.taskOwnerId && data.taskOwnerId !== data.userId) {
    const [task] = await db
      .select({ projectId: taskTable.projectId })
      .from(taskTable)
      .where(eq(taskTable.id, data.taskId))
      .limit(1);

    const [project] = task
      ? await db
          .select({ workspaceId: projectTable.workspaceId })
          .from(projectTable)
          .where(eq(projectTable.id, task.projectId))
          .limit(1)
      : [];

    await createNotification({
      userId: data.taskOwnerId,
      type: "time_entry_created",
      eventData: {
        taskTitle: data.taskTitle ?? null,
        projectId: task?.projectId ?? null,
        workspaceId: project?.workspaceId ?? null,
      },
      resourceId: data.taskId,
      resourceType: "task",
    });
  }
});

export default notification;
