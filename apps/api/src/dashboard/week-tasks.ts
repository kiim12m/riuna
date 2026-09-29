import { and, eq, gte, lt, lte, sql } from "drizzle-orm";
import db from "../database";
import { projectTable, taskTable } from "../database/schema";
import type { PersonalScope } from "../my-work/scope";
import { addDays, serverDayKey } from "../utils/day-boundaries";
import {
  type FieldRegistry,
  priorityRankExpression,
} from "../view/field-registry";
import type { FilterNode } from "../view/filter-to-sql";
import { workspaceTaskConditions } from "../view/workspace-task-query";
import { WEEK_WIDGET_TASKS_PER_DAY } from "./widget-config";

export type WeekDay = {
  /** `yyyy-mm-dd` del dia del servidor. */
  day: string;
  tasks: Array<{
    id: string;
    number: number;
    title: string;
    priority: string;
    isDone: boolean;
    projectId: string;
    projectName: string;
  }>;
  /** Cuantas quedan fuera de las que se enseñan. */
  overflow: number;
};

/**
 * Las tareas que vencen en una semana, repartidas por dia.
 *
 * **El cupo por dia se aplica con una funcion de ventana, no con un `LIMIT`.**
 * Un tope plano sobre el conjunto deja sin filas los ultimos dias en cuanto el
 * lunes tiene cuarenta tareas, y ademas no sabria decir cuantas se ha callado:
 * el `COUNT(*) OVER (PARTITION BY dia)` da el "+N mas" exacto en el mismo
 * barrido que ya se estaba pagando.
 *
 * **El dia se agrupa en TypeScript y no en SQL.** `utils/day-boundaries.ts`
 * documenta por que: la frontera del dia del servidor es hora local, y una
 * fecha que vuelve de la base la leen drizzle y node-postgres por el convenio
 * UTC. Particionar en SQL vale para contar dentro de cada dia —la particion es
 * consistente consigo misma—, pero la clave que ve el cliente la pone
 * `serverDayKey`, igual que en el Cronograma.
 */
export default async function weekTasks({
  workspaceId,
  userId,
  projectId,
  scope,
  filter,
  registry,
  weekStart,
}: {
  workspaceId: string;
  userId: string;
  projectId?: string | null;
  scope?: PersonalScope;
  filter: FilterNode | null;
  registry: FieldRegistry;
  weekStart: Date;
}): Promise<WeekDay[]> {
  const conditions = await workspaceTaskConditions({
    workspaceId,
    userId,
    projectId,
    scope,
    filter,
    registry,
  });

  const days: WeekDay[] = Array.from({ length: 7 }, (_, index) => ({
    day: serverDayKey(addDays(weekStart, index)),
    tasks: [],
    overflow: 0,
  }));

  // Sin equipos no hay nada que listar, pero la semana se dibuja igual: siete
  // columnas vacias dicen "no te toca nada", que es una respuesta.
  if (!conditions) return days;

  const weekEnd = addDays(weekStart, 7);
  const scoped = [
    ...conditions,
    gte(taskTable.dueDate, weekStart),
    lt(taskTable.dueDate, weekEnd),
  ];

  const ranked = db
    .select({
      id: taskTable.id,
      number: taskTable.number,
      title: taskTable.title,
      priority: taskTable.priority,
      dueDate: taskTable.dueDate,
      isDone: sql<boolean>`(${taskTable.completedAt} IS NOT NULL)`.as(
        "is_done",
      ),
      projectId: taskTable.projectId,
      projectName: projectTable.name,
      rank: sql<number>`ROW_NUMBER() OVER (
        PARTITION BY date_trunc('day', ${taskTable.dueDate})
        ORDER BY ${priorityRankExpression} DESC, ${taskTable.id}
      )`.as("rank"),
      dayTotal: sql<number>`COUNT(*) OVER (
        PARTITION BY date_trunc('day', ${taskTable.dueDate})
      )::int`.as("day_total"),
    })
    .from(taskTable)
    .innerJoin(projectTable, eq(taskTable.projectId, projectTable.id))
    .where(and(...scoped))
    .as("ranked");

  const rows = await db
    .select()
    .from(ranked)
    .where(lte(ranked.rank, WEEK_WIDGET_TASKS_PER_DAY));

  const byDay = new Map(days.map((day) => [day.day, day]));

  for (const row of rows) {
    if (!row.dueDate) continue;
    const bucket = byDay.get(serverDayKey(row.dueDate));
    if (!bucket) continue;

    bucket.tasks.push({
      id: row.id,
      number: row.number ?? 0,
      title: row.title,
      priority: row.priority,
      isDone: row.isDone,
      projectId: row.projectId,
      projectName: row.projectName,
    });
    bucket.overflow = Math.max(row.dayTotal - WEEK_WIDGET_TASKS_PER_DAY, 0);
  }

  return days;
}
