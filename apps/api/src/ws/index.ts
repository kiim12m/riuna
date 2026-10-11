import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { WSContext } from "hono/ws";
import db, { schema } from "../database";
import { subscribeToEvent } from "../events";
import { MY_WORK_EVENTS, recipientsForMyWork } from "../my-work/recipients";
import { isRedisConfigured } from "../redis";
import { log } from "../utils/log";
import type {
  BroadcastAdapter,
  BroadcastMessage,
  ProjectBroadcastMessage,
  UserBroadcast,
  UserBroadcastMessage,
} from "./broadcast-adapter";
import { InMemoryBroadcastAdapter } from "./in-memory-broadcast-adapter";
import { RedisBroadcastAdapter } from "./redis-broadcast-adapter";

const INSTANCE_ID = randomUUID();

type ProjectConnection = {
  ws: WSContext;
  userId: string;
  initiatorId: string;
};

type UserConnection = {
  ws: WSContext;
};

/**
 * User-scoped connections: tracks WebSocket connections keyed by userId.
 * Used for delivering user-targeted events like NOTIFICATION_CREATED.
 */
const userConnections = new Map<string, Set<UserConnection>>();

export function addUserConnection(userId: string, ws: WSContext) {
  if (!userConnections.has(userId)) {
    userConnections.set(userId, new Set());
  }
  const conn: UserConnection = { ws };
  userConnections.get(userId)?.add(conn);
  return conn;
}

export function removeUserConnection(userId: string, conn: UserConnection) {
  const connections = userConnections.get(userId);
  if (connections) {
    connections.delete(conn);
    if (connections.size === 0) {
      userConnections.delete(userId);
    }
  }
}

export function broadcastToUser(userId: string, message: UserBroadcastMessage) {
  deliverToLocalUserConnections(userId, message);

  if (!adapter) {
    return;
  }

  void adapter
    .publishToUser({ userId, message, origin: INSTANCE_ID })
    .catch((err) => {
      log.error("Failed to publish a user broadcast:", err);
    });
}

function deliverToLocalUserConnections(
  userId: string,
  message: UserBroadcastMessage,
) {
  const connections = userConnections.get(userId);
  if (!connections) return;

  const payload = JSON.stringify(message);
  for (const conn of connections) {
    try {
      conn.ws.send(payload);
    } catch {
      connections.delete(conn);
    }
  }
  if (connections.size === 0) {
    userConnections.delete(userId);
  }
}

/**
 * Local connections: each instance tracks only its own WebSocket connections.
 */
const projectConnections = new Map<string, Set<ProjectConnection>>();

/**
 * Batching queues and timers local per-instance.
 * They accumulate messages before flushing to the broadcast adapter.
 */
const projectBroadcastQueues = new Map<
  string,
  Map<string, { message: ProjectBroadcastMessage; excludeInitiatorId?: string }>
>();
const projectBroadcastTimeouts = new Map<
  string,
  ReturnType<typeof setTimeout>
>();

let adapter: BroadcastAdapter | null = null;

// --- Subscribe to incoming broadcasts and deliver to local connections ---
export async function initializeWebSocketAdapter() {
  if (adapter) return;

  const nextAdapter = isRedisConfigured()
    ? new RedisBroadcastAdapter()
    : new InMemoryBroadcastAdapter();

  try {
    await nextAdapter.subscribe((msg: BroadcastMessage) => {
      deliverToLocalConnections(
        msg.projectId,
        msg.message,
        msg.excludeInitiatorId,
      );
    });
    await nextAdapter.subscribeToUser((msg: UserBroadcast) => {
      if (msg.origin === INSTANCE_ID) {
        return;
      }
      deliverToLocalUserConnections(msg.userId, msg.message);
    });
  } catch (err) {
    await nextAdapter.shutdown().catch(() => {});
    throw err;
  }

  adapter = nextAdapter;
  log.info(`📡 WebSockets Initialized using: "${adapter.constructor.name}"`);
}

export async function shutdownWebSocketAdapter() {
  const pendingQueues = [...projectBroadcastQueues.entries()];

  for (const timeout of projectBroadcastTimeouts.values()) {
    clearTimeout(timeout);
  }
  projectBroadcastTimeouts.clear();
  projectBroadcastQueues.clear();

  const currentAdapter = adapter;
  if (currentAdapter) {
    await Promise.allSettled(
      pendingQueues.flatMap(([projectId, queue]) =>
        [...queue.values()].map(({ message, excludeInitiatorId }) =>
          currentAdapter.publish({ projectId, message, excludeInitiatorId }),
        ),
      ),
    );
  }

  await currentAdapter?.shutdown();
  adapter = null;
}

function deliverToLocalConnections(
  projectId: string,
  message: ProjectBroadcastMessage,
  excludeInitiatorId?: string,
) {
  const connections = projectConnections.get(projectId);
  if (!connections) return;

  const payload = JSON.stringify(message);
  for (const conn of connections) {
    if (excludeInitiatorId && conn.initiatorId === excludeInitiatorId) continue;
    try {
      conn.ws.send(payload);
    } catch {
      connections.delete(conn);
    }
  }
  if (connections.size === 0) {
    projectConnections.delete(projectId);
  }
}

export function addConnection(
  projectId: string,
  ws: WSContext,
  userId: string,
  initiatorId: string,
) {
  if (!projectConnections.has(projectId)) {
    projectConnections.set(projectId, new Set());
  }
  const conn: ProjectConnection = { ws, userId, initiatorId };
  projectConnections.get(projectId)?.add(conn);
  return conn;
}

export function removeConnection(projectId: string, conn: ProjectConnection) {
  const connections = projectConnections.get(projectId);
  if (connections) {
    connections.delete(conn);
    if (connections.size === 0) {
      projectConnections.delete(projectId);
    }
  }
}

export function broadcastToProject(
  projectId: string,
  message: ProjectBroadcastMessage,
  excludeInitiatorId?: string,
) {
  if (!adapter) {
    log.warn("broadcastToProject called before adapter initialization");
    return;
  }

  if (!projectBroadcastQueues.has(projectId)) {
    projectBroadcastQueues.set(projectId, new Map());
  }

  const messageKey = `${message.type}:${message.taskId ?? ""}:${message.sourceTaskId ?? ""}:${message.targetTaskId ?? ""}`;
  projectBroadcastQueues
    .get(projectId)
    ?.set(messageKey, { message, excludeInitiatorId });

  if (projectBroadcastTimeouts.has(projectId)) {
    return;
  }

  const timeout = setTimeout(() => {
    projectBroadcastTimeouts.delete(projectId);
    const queue = projectBroadcastQueues.get(projectId);
    projectBroadcastQueues.delete(projectId);

    if (!queue || !adapter) return;

    // Publish each queued message through the adapter
    for (const { message: msg, excludeInitiatorId: exId } of queue.values()) {
      void adapter
        .publish({
          projectId,
          message: msg,
          excludeInitiatorId: exId,
        })
        .catch((err) => {
          log.error(
            `Failed to publish broadcast for project ${projectId}:`,
            err,
          );
        });
    }
  }, 100);

  projectBroadcastTimeouts.set(projectId, timeout);
}

type TaskEvent = {
  id: string | undefined;
  projectId: string;
  userId: string;
  initiatorId?: string;
  taskId: string;
  sourceTaskId: string | undefined;
  targetTaskId: string | undefined;
  oldParentId?: string | null;
  newParentId?: string | null;
};

const taskUpdateEvents = [
  "task.created",
  "task.updated",
  "task.parent_changed",
  "task.epics_changed",
  "task.cycle_changed",
  "task.deleted",
  "task.status_changed",
  "task.priority_changed",
  "task.unassigned",
  "task.assignee_changed",
  // Los tres que faltaban. `assignees_changed` es el que emite la via de
  // asignacion multiple —la que usa la interfaz principal desde la Fase 1— y no
  // lo escuchaba **nadie**: ni el WebSocket, ni la actividad, ni las
  // notificaciones, ni las integraciones. Anadir a alguien a una tarea no le
  // llegaba por ningun canal. Lo mismo con la asignacion a un equipo, que es
  // justo el requisito que motivo esa fase.
  "task.assignees_changed",
  "task.team_changed",
  "task.team_unassigned",
  "task.due_date_changed",
  "task.title_changed",
  "task.description_changed",
  "task.label_assigned",
  "task.label_unassigned",
  "task.label_created",
  "task.label_deleted",
  "task-relation.created",
  "task-relation.deleted",
  "comment.created",
  "comment.deleted",
  "comment.updated",
];

subscribeToEvent<{
  taskId: string;
  userId: string;
  initiatorId?: string;
  type: string;
  content: string;
  fromProjectId: string;
  fromProjectName: string;
  toProjectId: string;
  toProjectName: string;
  oldStatus: string;
  newStatus: string;
}>("task.moved", async (data) => {
  const { fromProjectId, initiatorId, toProjectId, taskId } = data;

  broadcastToProject(
    toProjectId,
    { type: "TASK_MOVED", projectId: toProjectId, taskId },
    initiatorId,
  );
  broadcastToProject(
    fromProjectId,
    { type: "TASK_MOVED", projectId: fromProjectId, taskId },
    initiatorId,
  );
});

// El canal de proyecto si valida con un esquema estricto bajo Redis
// (`broadcastMessageSchema`, un `v.object`), asi que este mensaje se queda en
// los campos ya declarados: `type`, `projectId` y `taskId`. Un campo nuevo aqui
// funcionaria en una sola instancia y desapareceria con Redis.
subscribeToEvent<{
  projectId: string;
  cycleId: string;
  userId: string;
  initiatorId?: string;
}>("cycle.changed", async (data) => {
  const { projectId, initiatorId } = data;
  if (!projectId) return;

  broadcastToProject(
    projectId,
    { type: "CYCLE_UPDATED", projectId, taskId: "" },
    initiatorId,
  );
});

subscribeToEvent<{
  projectId: string;
  epicId: string;
  userId: string;
  initiatorId?: string;
}>("epic.changed", async (data) => {
  const { projectId, initiatorId } = data;
  if (!projectId) return;

  broadcastToProject(
    projectId,
    { type: "EPIC_UPDATED", projectId, taskId: "" },
    initiatorId,
  );
});

/** Los miembros de un espacio, para difundir una vista compartida sin proyecto. */
async function membersOfWorkspace(workspaceId: string): Promise<string[]> {
  const rows = await db
    .selectDistinct({ userId: schema.workspaceUserTable.userId })
    .from(schema.workspaceUserTable)
    .where(eq(schema.workspaceUserTable.workspaceId, workspaceId));

  return rows.map((row) => row.userId);
}

subscribeToEvent<{
  workspaceId: string;
  projectId: string | null;
  viewId: string;
  userId: string;
  isShared: boolean;
  initiatorId?: string;
}>("view.changed", async (data) => {
  const { workspaceId, projectId, initiatorId } = data;

  if (projectId) {
    broadcastToProject(
      projectId,
      { type: "VIEW_UPDATED", projectId, taskId: "" },
      initiatorId,
    );
    return;
  }

  // Una vista de espacio no tiene canal de proyecto que la escuche —"Mis
  // tareas" no abre ninguno—, asi que va por el canal de usuario. Compartida,
  // a todo el espacio; privada, solo a quien la creo, que es quien puede
  // verla.
  const recipients = data.isShared
    ? await membersOfWorkspace(workspaceId)
    : [data.userId];

  for (const userId of recipients) {
    broadcastToUser(userId, { type: "VIEW_UPDATED", workspaceId });
  }
});

subscribeToEvent<{
  workspaceId: string;
  projectId: string | null;
  fieldDefinitionId: string;
  userId: string;
  initiatorId?: string;
}>("field-definition.changed", async (data) => {
  const { workspaceId, projectId, initiatorId } = data;

  // Un campo de proyecto avisa a su proyecto. Uno de espacio afecta a todos a
  // la vez y no hay un canal de espacio de trabajo, asi que se resuelven sus
  // proyectos y se avisa a cada uno. Es una consulta de mas en un evento que
  // ocurre cuando alguien edita los ajustes, no en la ruta caliente.
  const projectIds = projectId
    ? [projectId]
    : (
        await db
          .select({ id: schema.projectTable.id })
          .from(schema.projectTable)
          .where(eq(schema.projectTable.workspaceId, workspaceId))
      ).map((row) => row.id);

  for (const id of projectIds) {
    broadcastToProject(
      id,
      { type: "FIELD_DEFINITION_UPDATED", projectId: id, taskId: "" },
      initiatorId,
    );
  }
});

subscribeToEvent<{
  projectId: string;
  userId: string;
  initiatorId?: string;
}>("task-relation.refresh", async (data) => {
  const { projectId, initiatorId } = data;
  if (!projectId) return;

  broadcastToProject(
    projectId,
    {
      type: "TASK_RELATION_UPDATED",
      projectId,
      taskId: "",
      sourceTaskId: undefined,
      targetTaskId: undefined,
    },
    initiatorId,
  );
});

subscribeToEvent<{ notificationId: string; userId: string }>(
  "notification.created",
  async (data) => {
    if (data.userId) {
      broadcastToUser(data.userId, { type: "NOTIFICATION_CREATED" });
    }
  },
);

// El plan personal es de una sola persona: el evento ya trae su `userId`, sin
// resolucion de destinatarios de por medio (ADR 040).
subscribeToEvent<{ userId: string }>("personal-plan.changed", async (data) => {
  if (data.userId) {
    broadcastToUser(data.userId, { type: "PLAN_INVALIDATED" });
  }
});

// El Cronograma lee `personal_plan_entry` ademas de `schedule_block`, asi que
// tambien escucha PLAN_INVALIDATED en el cliente (ADR 041); este es solo el
// que le falta para sus propios cambios (anclar hora, bloques fijos).
subscribeToEvent<{ userId: string }>("schedule.changed", async (data) => {
  if (data.userId) {
    broadcastToUser(data.userId, { type: "SCHEDULE_INVALIDATED" });
  }
});

// Festivos, ausencias y el responsable de un departamento (ADR 060, ADR 059):
// el evento ya trae a quien le cambia lo que ve, resuelto al publicar. Cambian
// la capacidad de Hoy, del Planificador y del Cronograma, el aviso de «tu
// responsable» y «Mi equipo».
subscribeToEvent<{ workspaceId: string; userIds: string[] }>(
  "availability.changed",
  async (data) => {
    for (const userId of data.userIds) {
      broadcastToUser(userId, {
        type: "AVAILABILITY_INVALIDATED",
        workspaceId: data.workspaceId,
      });
    }
  },
);

// Un solo cronometro por persona (ADR 044): arrancar, parar -a mano o porque
// la tarea entro en una columna final-, editar y borrar son los cuatro
// cambios que el pie de la barra, Hoy y el parte de horas necesitan saber. La
// misma cola de eventos ya sirve a `notification/index.ts` para
// `time-entry.created`; esta es una segunda escucha independiente, no un
// reemplazo.
function notifyTimerChanged(userId?: string) {
  if (userId) {
    broadcastToUser(userId, { type: "TIMER_CHANGED" });
  }
}
subscribeToEvent<{ userId: string }>("time-entry.created", async (data) => {
  notifyTimerChanged(data.userId);
});
subscribeToEvent<{ userId: string }>("time-entry.stopped", async (data) => {
  notifyTimerChanged(data.userId);
});
subscribeToEvent<{ userId: string }>("time-entry.updated", async (data) => {
  notifyTimerChanged(data.userId);
});
subscribeToEvent<{ userId: string }>("time-entry.deleted", async (data) => {
  notifyTimerChanged(data.userId);
});

// "Mi trabajo" cruza proyectos, asi que su invalidacion va por el canal de
// usuario: la tarea puede cambiar en un proyecto que quien la tiene asignada no
// esta mirando, y ahi no hay conexion de proyecto que reciba nada.
//
// El mensaje no lleva `workspaceId` a proposito: anadirlo obligaria a resolver
// `project -> workspace` en cada evento, y la clave de consulta del cliente ya
// lo lleva, asi que invalidar por el prefijo `["my-work"]` solo refresca la
// consulta que este montada.
//
// **El canal de usuario de Redis no necesita ningun cambio.**
// `userBroadcastSchema` valida el mensaje con `v.looseObject`, asi que conserva
// las claves que no declara. El aviso escrito en `broadcast-adapter.ts` —el de
// que un campo nuevo desaparece bajo Redis— es del canal de **proyecto**, cuyo
// `broadcastMessageSchema` si es un `v.object` estricto. No hay que "arreglar"
// esto anadiendo un esquema estricto aqui.
for (const eventName of MY_WORK_EVENTS) {
  subscribeToEvent<Record<string, unknown>>(eventName, async (data) => {
    for (const userId of await recipientsForMyWork(eventName, data)) {
      broadcastToUser(userId, { type: "MY_WORK_INVALIDATED" });
    }
  });
}

for (const eventName of taskUpdateEvents) {
  subscribeToEvent<TaskEvent>(eventName, async (data) => {
    const { projectId, initiatorId } = data;
    const taskId = data.taskId;

    if (!projectId || !taskId) return;
    let type: string;
    switch (eventName) {
      case "task.created":
        type = "TASK_CREATED";
        break;
      case "task.deleted":
        type = "TASK_DELETED";
        break;
      case "task-relation.created":
      case "task-relation.deleted":
        type = "TASK_RELATION_UPDATED";
        break;
      case "task.label_assigned":
      case "task.label_unassigned":
      case "task.label_created":
      case "task.label_deleted":
        type = "TASK_LABEL_UPDATED";
        break;
      case "comment.created":
      case "comment.deleted":
      case "comment.updated":
        type = "COMMENT_UPDATED";
        break;
      default:
        type = "TASK_UPDATED";
    }

    broadcastToProject(
      projectId,
      {
        type,
        projectId,
        taskId: taskId,
        sourceTaskId: data.sourceTaskId,
        targetTaskId: data.targetTaskId,
        // Solo los trae `task.parent_changed`; en los demas van indefinidos.
        oldParentId: data.oldParentId,
        newParentId: data.newParentId,
      },
      initiatorId,
    );
  });
}
