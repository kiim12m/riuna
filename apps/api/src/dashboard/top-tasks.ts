import { and, asc, desc, eq, isNull, ne, type SQL, sql } from "drizzle-orm";
import db from "../database";
import { projectTable, taskTable } from "../database/schema";
import { type PersonalScope, personalScopeCondition } from "../my-work/scope";
import {
  type FieldRegistry,
  priorityRankExpression,
} from "../view/field-registry";
import { type FilterNode, filterToSql } from "../view/filter-to-sql";
import { TABLE_WIDGET_ROWS } from "./widget-config";

/**
 * Las filas de la tabla embebida.
 *
 * **Devuelve las N primeras y no una pagina, y no lleva total.** Paginar de
 * verdad dentro de una tarjeta de trescientos pixeles es una ficcion, y el
 * total obligaria a un segundo barrido completo para un numero que nadie mira
 * en un widget. El orden es el mismo que el de "Mi trabajo" —vence antes,
 * luego mas prioritaria—, que es lo que hace util una lista corta.
 */
export default async function topTasks({
  workspaceId,
  userId,
  projectId,
  scope,
  filter,
  registry,
}: {
  workspaceId: string;
  userId: string;
  projectId?: string | null;
  scope?: PersonalScope;
  filter: FilterNode | null;
  registry: FieldRegistry;
}) {
  const conditions: SQL[] = [
    eq(projectTable.workspaceId, workspaceId),
    isNull(projectTable.archivedAt),
    ne(taskTable.status, "archived"),
  ];

  if (projectId) {
    conditions.push(eq(taskTable.projectId, projectId));
  }

  if (scope) {
    const personal = await personalScopeCondition(scope, workspaceId, userId);
    // Sin equipos no hay nada que listar. Devolver la lista entera seria peor
    // que devolver ninguna.
    if (!personal) return [];
    conditions.push(personal);
  }

  const compiled = filterToSql(filter, registry);
  if (compiled) conditions.push(compiled);

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
    .where(and(...conditions))
    .orderBy(
      sql`${taskTable.dueDate} ASC NULLS LAST`,
      desc(priorityRankExpression),
      asc(taskTable.id),
    )
    .limit(TABLE_WIDGET_ROWS);
}
