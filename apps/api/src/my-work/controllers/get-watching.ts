import { and, desc, eq, sql } from "drizzle-orm";
import db from "../../database";
import {
  projectTable,
  taskTable,
  taskWatcherTable,
  teamTable,
} from "../../database/schema";
import { decorateTasks, getWorkspaceColumns } from "../decorate";
import { assignedTo, columns, openInWorkspace } from "./get-waiting";

/** Tope de la lista: es una pantalla de repaso, como «Esperando a». */
export const WATCHING_LIMIT = 100;

/**
 * «Observando» (ADR 076): lo que observo a proposito, sigue abierto y no tengo
 * asignado; lo asignado ya sale en el resto de Mis tareas. Lo ultimo que se
 * movio, primero: la pregunta es «que ha pasado en lo que sigo».
 */
export default async function getWatching({
  workspaceId,
  userId,
}: {
  workspaceId: string;
  userId: string;
}) {
  const [projectColumns, rows] = await Promise.all([
    getWorkspaceColumns(workspaceId),
    db
      .select(columns)
      .from(taskTable)
      .innerJoin(projectTable, eq(taskTable.projectId, projectTable.id))
      .innerJoin(
        taskWatcherTable,
        and(
          eq(taskWatcherTable.taskId, taskTable.id),
          eq(taskWatcherTable.userId, userId),
        ),
      )
      .leftJoin(teamTable, eq(taskTable.teamId, teamTable.id))
      .where(
        and(
          ...openInWorkspace(workspaceId),
          sql`NOT ${assignedTo(taskTable.id, userId)}`,
        ),
      )
      .orderBy(desc(taskTable.updatedAt), desc(taskTable.id))
      .limit(WATCHING_LIMIT),
  ]);

  return { tasks: await decorateTasks(rows, projectColumns) };
}
