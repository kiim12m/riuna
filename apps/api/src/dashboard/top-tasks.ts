import { and, asc, desc, eq, type SQL, sql } from "drizzle-orm";
import db from "../database";
import { projectTable, taskTable } from "../database/schema";
import type { PersonalScope } from "../my-work/scope";
import {
  type FieldRegistry,
  priorityRankExpression,
} from "../view/field-registry";
import type { FilterNode } from "../view/filter-to-sql";
import { workspaceTaskConditions } from "../view/workspace-task-query";
import { TABLE_WIDGET_ROWS } from "./widget-config";

/**
 * Las filas de la tabla embebida.
 *
 * **Devuelve las N primeras y no una pagina, y no lleva total.** Paginar de
 * verdad dentro de una tarjeta de trescientos pixeles es una ficcion, y el
 * total obligaria a un segundo barrido completo para un numero que nadie mira
 * en un widget. El orden es el mismo que el de "Mi trabajo" —vence antes,
 * luego mas prioritaria—, que es lo que hace util una lista corta.
 *
 * La lista que abre una tarjeta de recuento (`get-widget-tasks.ts`) es esta
 * misma lectura con los predicados de la tarjeta en `extra` y paginada: las
 * mismas columnas y el mismo orden, y la misma fila en la web.
 */
export default async function topTasks({
  workspaceId,
  userId,
  projectId,
  scope,
  filter,
  registry,
  extra = [],
  limit = TABLE_WIDGET_ROWS,
  offset = 0,
}: {
  workspaceId: string;
  userId: string;
  projectId?: string | null;
  scope?: PersonalScope;
  filter: FilterNode | null;
  registry: FieldRegistry;
  extra?: SQL[];
  limit?: number;
  offset?: number;
}) {
  const conditions = await workspaceTaskConditions({
    workspaceId,
    userId,
    projectId,
    scope,
    filter,
    registry,
  });

  // Sin equipos no hay nada que listar. Devolver la lista entera seria peor que
  // devolver ninguna.
  if (!conditions) return [];

  return db
    .select({
      id: taskTable.id,
      number: taskTable.number,
      title: taskTable.title,
      priority: taskTable.priority,
      dueDate: taskTable.dueDate,
      isDone: sql<boolean>`(${taskTable.completedAt} IS NOT NULL)`,
      projectId: taskTable.projectId,
      projectName: projectTable.name,
      projectSlug: projectTable.slug,
    })
    .from(taskTable)
    .innerJoin(projectTable, eq(taskTable.projectId, projectTable.id))
    .where(and(...conditions, ...extra))
    .orderBy(
      sql`${taskTable.dueDate} ASC NULLS LAST`,
      desc(priorityRankExpression),
      asc(taskTable.id),
    )
    .limit(limit)
    .offset(offset);
}
