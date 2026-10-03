import { and, asc, eq, inArray, isNull, ne, type SQL, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import db from "../../database";
import {
  activityTable,
  projectTable,
  taskAssigneeTable,
  taskRelationTable,
  taskTable,
  teamTable,
} from "../../database/schema";
import { decorateTasks, getWorkspaceColumns } from "../decorate";
import { assignedCondition } from "../scope";

/** Tope de cada lista: es una pantalla de repaso, no un listado completo. */
export const WAITING_LIMIT = 100;

const columns = {
  id: taskTable.id,
  number: taskTable.number,
  title: taskTable.title,
  status: taskTable.status,
  priority: taskTable.priority,
  startDate: taskTable.startDate,
  dueDate: taskTable.dueDate,
  createdAt: taskTable.createdAt,
  userId: taskTable.userId,
  parentId: taskTable.parentId,
  depth: taskTable.depth,
  projectId: taskTable.projectId,
  projectName: projectTable.name,
  projectSlug: projectTable.slug,
  projectIcon: projectTable.icon,
  teamId: taskTable.teamId,
  teamName: teamTable.name,
};

/** Sin terminar (ADR 030), sin archivar y en un proyecto vivo del espacio. */
function openInWorkspace(workspaceId: string): SQL[] {
  return [
    eq(projectTable.workspaceId, workspaceId),
    isNull(projectTable.archivedAt),
    isNull(taskTable.completedAt),
    ne(taskTable.status, "archived"),
  ];
}

function assignedTo(taskId: SQL | typeof taskTable.id, userId: string) {
  return sql`EXISTS (SELECT 1 FROM ${taskAssigneeTable} WHERE ${taskAssigneeTable.taskId} = ${taskId} AND ${taskAssigneeTable.userId} = ${userId})`;
}

/**
 * «Esperando a» (sub-bloque 1.4): lo que depende de otra persona.
 *
 * - **Delegado**: lo que he creado y tiene a otra persona asignada, no a mi, y
 *   sigue abierto. «Lo he creado yo» sale de la actividad `created`, porque
 *   `task` no guarda quien la creo. Medido en el banco de 50.000 tareas con
 *   200.000 filas de actividad: p95 de 57 ms, todo por indices, asi que no
 *   hace falta una columna `created_by`.
 * - **Bloqueado**: lo mio abierto que tiene delante una tarea abierta que no
 *   es mia, por una relacion `blocks` (el origen bloquea al destino).
 */
export default async function getWaiting({
  workspaceId,
  userId,
}: {
  workspaceId: string;
  userId: string;
}) {
  const projectColumns = await getWorkspaceColumns(workspaceId);

  const createdByMe = sql`${taskTable.id} IN (
    SELECT ${activityTable.taskId} FROM ${activityTable}
    WHERE ${activityTable.userId} = ${userId} AND ${activityTable.type} = 'created'
  )`;
  const othersAssigned = sql`EXISTS (SELECT 1 FROM ${taskAssigneeTable} WHERE ${taskAssigneeTable.taskId} = ${taskTable.id} AND ${taskAssigneeTable.userId} <> ${userId})`;

  const blocker = alias(taskTable, "blocker");
  const blockerProject = alias(projectTable, "blocker_project");

  const [delegatedRows, blockingRows] = await Promise.all([
    db
      .select(columns)
      .from(taskTable)
      .innerJoin(projectTable, eq(taskTable.projectId, projectTable.id))
      .leftJoin(teamTable, eq(taskTable.teamId, teamTable.id))
      .where(
        and(
          ...openInWorkspace(workspaceId),
          createdByMe,
          othersAssigned,
          sql`NOT ${assignedTo(taskTable.id, userId)}`,
        ),
      )
      .orderBy(sql`${taskTable.dueDate} ASC NULLS LAST`, asc(taskTable.id))
      .limit(WAITING_LIMIT),
    db
      .select({
        blockedId: taskRelationTable.targetTaskId,
        id: blocker.id,
        number: blocker.number,
        title: blocker.title,
        projectId: blocker.projectId,
        projectSlug: blockerProject.slug,
      })
      .from(taskRelationTable)
      .innerJoin(taskTable, eq(taskRelationTable.targetTaskId, taskTable.id))
      .innerJoin(projectTable, eq(taskTable.projectId, projectTable.id))
      .innerJoin(blocker, eq(taskRelationTable.sourceTaskId, blocker.id))
      .innerJoin(blockerProject, eq(blocker.projectId, blockerProject.id))
      .where(
        and(
          eq(taskRelationTable.relationType, "blocks"),
          ...openInWorkspace(workspaceId),
          assignedCondition(userId),
          // Una relacion puede cruzar espacios; lo que bloquea tiene que ser
          // de este, o se filtraria el titulo de una tarea ajena.
          eq(blockerProject.workspaceId, workspaceId),
          isNull(blocker.completedAt),
          ne(blocker.status, "archived"),
          sql`NOT ${assignedTo(sql`${blocker.id}`, userId)}`,
        ),
      )
      .orderBy(asc(blocker.id)),
  ]);

  const blockersByTask = new Map<
    string,
    Omit<(typeof blockingRows)[number], "blockedId">[]
  >();
  for (const { blockedId, ...blocking } of blockingRows) {
    const list = blockersByTask.get(blockedId) ?? [];
    if (!list.some((existing) => existing.id === blocking.id)) {
      list.push(blocking);
    }
    blockersByTask.set(blockedId, list);
  }

  const blockedIds = [...blockersByTask.keys()];
  const blockedRows =
    blockedIds.length === 0
      ? []
      : await db
          .select(columns)
          .from(taskTable)
          .innerJoin(projectTable, eq(taskTable.projectId, projectTable.id))
          .leftJoin(teamTable, eq(taskTable.teamId, teamTable.id))
          .where(inArray(taskTable.id, blockedIds))
          .orderBy(sql`${taskTable.dueDate} ASC NULLS LAST`, asc(taskTable.id))
          .limit(WAITING_LIMIT);

  const [delegated, blocked] = await Promise.all([
    decorateTasks(delegatedRows, projectColumns),
    decorateTasks(blockedRows, projectColumns),
  ]);

  return {
    delegated,
    blocked: blocked.map((task) => ({
      ...task,
      blockedBy: blockersByTask.get(task.id) ?? [],
    })),
  };
}
