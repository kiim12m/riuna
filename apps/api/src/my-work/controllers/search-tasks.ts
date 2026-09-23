import { and, asc, desc, eq, type SQL, sql } from "drizzle-orm";
import db from "../../database";
import { projectTable, taskTable, teamTable } from "../../database/schema";
import { serverDayKey } from "../../utils/day-boundaries";
import { dueWindowExpression } from "../../utils/due-window";
import {
  type FieldRegistry,
  priorityRankExpression,
} from "../../view/field-registry";
import type { FilterNode } from "../../view/filter-to-sql";
import { workspaceTaskConditions } from "../../view/workspace-task-query";
import {
  decorateTasks,
  getWorkspaceColumns,
  notDoneCondition,
} from "../decorate";
import { emptyPage, resolvePaging, TOTAL_CAP } from "../pagination";
import type { PersonalScope } from "../scope";

/**
 * Por que se ordena. No admite `number` ni `position`: se numeran por proyecto,
 * asi que ordenar por ellos entre proyectos no significa nada. Es la misma
 * razon por la que `buildWorkspaceFieldRegistry` los retira del registro.
 */
export const SEARCH_SORT_FIELDS = [
  "smart",
  "dueDate",
  "startDate",
  "priority",
  "title",
  "createdAt",
  "updatedAt",
  "project",
] as const;

export type SearchSortField = (typeof SEARCH_SORT_FIELDS)[number];

export type SearchTasksOptions = {
  workspaceId: string;
  userId: string;
  scope: PersonalScope;
  projectId?: string;
  filter: FilterNode | null;
  registry: FieldRegistry;
  includeDone?: boolean;
  sortBy?: SearchSortField;
  sortOrder?: "asc" | "desc";
  page?: number;
  limit?: number;
  now?: Date;
};

/**
 * El orden, siempre cerrado por `id`.
 *
 * **Sin un orden total, dos paginas consecutivas pueden solaparse o saltarse
 * una fila**: con `OFFSET`, Postgres no promete nada sobre el reparto de los
 * empates entre una consulta y la siguiente. Ordenar por prioridad en un
 * espacio con cinco valores deja miles de empates, asi que aqui no es un caso
 * raro sino el habitual.
 */
export function buildOrderBy(
  sortBy: SearchSortField,
  sortOrder: "asc" | "desc",
): SQL[] {
  const direction = sortOrder === "desc" ? desc : asc;
  const tail = asc(taskTable.id);

  switch (sortBy) {
    case "dueDate":
      return [
        sortOrder === "desc"
          ? sql`${taskTable.dueDate} DESC NULLS LAST`
          : sql`${taskTable.dueDate} ASC NULLS LAST`,
        tail,
      ];
    case "startDate":
      return [
        sortOrder === "desc"
          ? sql`${taskTable.startDate} DESC NULLS LAST`
          : sql`${taskTable.startDate} ASC NULLS LAST`,
        tail,
      ];
    case "priority":
      return [direction(priorityRankExpression), tail];
    case "title":
      return [direction(taskTable.title), tail];
    case "createdAt":
      return [direction(taskTable.createdAt), tail];
    case "updatedAt":
      return [direction(taskTable.updatedAt), tail];
    case "project":
      return [direction(projectTable.name), tail];
    default:
      // El mismo orden que "Mi trabajo": vence antes, luego mas prioritaria.
      // Es lo que hace util una lista que mezcla proyectos, y por eso es el
      // orden por defecto y no `createdAt`.
      return [
        sql`${taskTable.dueDate} ASC NULLS LAST`,
        desc(priorityRankExpression),
        tail,
      ];
  }
}

/**
 * Las tareas de una persona en todo el espacio, con el motor de filtros y
 * paginadas.
 *
 * Es `getMyWork` sin sus ventanas de vencimiento fijas y con el arbol de
 * filtros de la ADR 014 en su lugar: lo que sostiene las vistas personales
 * —lista, tablero, gantt y tabla— frente a las cinco vistas de proyecto.
 * Comparte con ella el ambito (`workspaceTaskConditions`), la decoracion de
 * filas (`decorate.ts`) y la forma de pagina (`pagination.ts`), que es lo que
 * impide que las dos lecturas del espacio acaben respondiendo cosas distintas
 * a la misma pregunta.
 *
 * Devuelve tambien `estimate`, que las vistas personales necesitan para sumar
 * carga y que `getMyWork` no incluye.
 */
export default async function searchTasks({
  workspaceId,
  userId,
  scope,
  projectId,
  filter,
  registry,
  includeDone = false,
  sortBy = "smart",
  sortOrder = "asc",
  page: requestedPage,
  limit,
  now = new Date(),
}: SearchTasksOptions) {
  const { page, pageSize, offset } = resolvePaging(requestedPage, limit);
  const serverToday = serverDayKey(now);

  const [projectColumns, scopeConditions] = await Promise.all([
    getWorkspaceColumns(workspaceId),
    workspaceTaskConditions({
      workspaceId,
      userId,
      projectId,
      scope,
      filter,
      registry,
    }),
  ]);

  // `null` es "el ambito no puede casar nada" —quien no pertenece a ningun
  // equipo—, no "sin filtro". Devolver la pagina vacia y no el espacio entero.
  if (!scopeConditions) return { ...emptyPage(page, pageSize), serverToday };

  const conditions: SQL[] = [...scopeConditions];

  if (!includeDone) {
    const notDone = notDoneCondition(projectColumns);
    if (notDone) conditions.push(notDone);
  }

  const cappedTotal = db
    .select({ id: taskTable.id })
    .from(taskTable)
    .innerJoin(projectTable, eq(taskTable.projectId, projectTable.id))
    .where(and(...conditions))
    .limit(TOTAL_CAP + 1)
    .as("capped_total");

  // `hasMore` sale de pedir una fila de mas, no del total: el total esta topado
  // y a partir del tope no sabria decir si queda pagina siguiente.
  const [rows, totalRows] = await Promise.all([
    db
      .select({
        id: taskTable.id,
        number: taskTable.number,
        title: taskTable.title,
        status: taskTable.status,
        priority: taskTable.priority,
        estimate: taskTable.estimate,
        startDate: taskTable.startDate,
        dueDate: taskTable.dueDate,
        createdAt: taskTable.createdAt,
        updatedAt: taskTable.updatedAt,
        userId: taskTable.userId,
        projectId: taskTable.projectId,
        projectName: projectTable.name,
        projectSlug: projectTable.slug,
        projectIcon: projectTable.icon,
        teamId: taskTable.teamId,
        teamName: teamTable.name,
        dueWindow: dueWindowExpression(now),
      })
      .from(taskTable)
      .innerJoin(projectTable, eq(taskTable.projectId, projectTable.id))
      .leftJoin(teamTable, eq(taskTable.teamId, teamTable.id))
      .where(and(...conditions))
      .orderBy(...buildOrderBy(sortBy, sortOrder))
      .limit(pageSize + 1)
      .offset(offset),
    db.select({ count: sql<number>`count(*)` }).from(cappedTotal),
  ]);

  const countedRows = Number(totalRows[0]?.count ?? 0);
  const totalIsCapped = countedRows > TOTAL_CAP;
  const total = totalIsCapped ? TOTAL_CAP : countedRows;

  const hasMore = rows.length > pageSize;
  const pageRows = hasMore ? rows.slice(0, pageSize) : rows;

  const tasks = await decorateTasks(pageRows, projectColumns);

  return {
    tasks,
    pagination: { page, pageSize, hasMore, total, totalIsCapped },
    serverToday,
  };
}
