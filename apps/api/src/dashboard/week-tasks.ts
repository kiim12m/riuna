import { and, eq, gte, lt, lte, sql } from "drizzle-orm";
import db from "../database";
import {
  personalPlanEntryTable,
  projectTable,
  taskTable,
} from "../database/schema";
import { addDays, serverDayKey, serverWallTime } from "../utils/day-boundaries";
import type { FieldRegistry } from "../view/field-registry";
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
 * Lo que quien mira tiene **planificado** en una semana, repartido por dia.
 *
 * **Es el plan, no el vencimiento** (ADR 093). Vencer y planificar son datos
 * distintos desde la ADR 040, y la tira se leia por `due_date`: una tarea que
 * vence el martes de la semana que viene contaba en "Vencen esta semana" y no
 * aparecia en ningun dia, y lo que la persona habia puesto en su Planificador
 * no salia en ningun sitio del panel. La fuente es `personal_plan_entry`, la
 * misma que Planificador, Hoy y Cronograma.
 *
 * **Sin ambito personal.** El plan ya es de quien mira, y planificar no exige
 * estar asignado: acotar a lo asignado escondia tareas que la persona si se
 * habia puesto en la semana. El proyecto y el filtro del widget siguen
 * acotando, y `workspaceTaskConditions` sigue dejando fuera lo archivado.
 *
 * **El cupo por dia se aplica con una funcion de ventana, no con un `LIMIT`.**
 * Un tope plano sobre el conjunto deja sin filas los ultimos dias en cuanto el
 * lunes tiene cuarenta tareas, y ademas no sabria decir cuantas se ha callado:
 * el `COUNT(*) OVER (PARTITION BY dia)` da el "+N mas" exacto en el mismo
 * barrido. Dentro del dia, el orden es el del Planificador.
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
  filter,
  registry,
  weekStart,
}: {
  workspaceId: string;
  userId: string;
  projectId?: string | null;
  filter: FilterNode | null;
  registry: FieldRegistry;
  weekStart: Date;
}): Promise<WeekDay[]> {
  const conditions = await workspaceTaskConditions({
    workspaceId,
    userId,
    projectId,
    filter,
    registry,
  });

  const days: WeekDay[] = Array.from({ length: 7 }, (_, index) => ({
    day: serverDayKey(addDays(weekStart, index)),
    tasks: [],
    overflow: 0,
  }));

  // Sin ambito personal no deberia llegar nunca un `null`, pero el tipo lo
  // comparte con "team". La semana se dibuja igual: siete columnas vacias dicen
  // "no tienes nada planificado", que es una respuesta.
  if (!conditions) return days;

  const weekEnd = addDays(weekStart, 7);
  const scoped = [
    ...conditions,
    eq(personalPlanEntryTable.userId, userId),
    // Sin esto, una entrada planificada desde otro espacio de la misma persona
    // se colaba en una fecha compartida (ADR 046).
    eq(personalPlanEntryTable.workspaceId, workspaceId),
    gte(personalPlanEntryTable.plannedDate, weekStart),
    lt(personalPlanEntryTable.plannedDate, weekEnd),
  ];

  // El dia de cada entrada en la zona del servidor, el mismo con el que
  // `serverDayKey` reparte las filas abajo. `planned_date` ya es medianoche del
  // servidor, pero cortar en UTC partiria un dia de Madrid en dos (ADR 049).
  const plannedDay = serverWallTime(personalPlanEntryTable.plannedDate);

  const ranked = db
    .select({
      id: taskTable.id,
      number: taskTable.number,
      title: taskTable.title,
      priority: taskTable.priority,
      plannedDate: personalPlanEntryTable.plannedDate,
      isDone: sql<boolean>`(${taskTable.completedAt} IS NOT NULL)`.as(
        "is_done",
      ),
      projectId: taskTable.projectId,
      projectName: projectTable.name,
      rank: sql<number>`ROW_NUMBER() OVER (
        PARTITION BY date_trunc('day', ${plannedDay})
        ORDER BY ${personalPlanEntryTable.position}, ${taskTable.id}
      )`.as("rank"),
      dayTotal: sql<number>`COUNT(*) OVER (
        PARTITION BY date_trunc('day', ${plannedDay})
      )::int`.as("day_total"),
    })
    .from(personalPlanEntryTable)
    .innerJoin(taskTable, eq(personalPlanEntryTable.taskId, taskTable.id))
    .innerJoin(projectTable, eq(taskTable.projectId, projectTable.id))
    .where(and(...scoped))
    .as("ranked");

  const rows = await db
    .select()
    .from(ranked)
    .where(lte(ranked.rank, WEEK_WIDGET_TASKS_PER_DAY))
    .orderBy(ranked.plannedDate, ranked.rank);

  const byDay = new Map(days.map((day) => [day.day, day]));

  for (const row of rows) {
    const bucket = byDay.get(serverDayKey(row.plannedDate));
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
