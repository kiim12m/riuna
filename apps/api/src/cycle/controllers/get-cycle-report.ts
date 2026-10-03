import { and, eq, isNotNull, ne, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { cycleTable, taskTable } from "../../database/schema";
import { serverWallTime } from "../../utils/day-boundaries";

type BurndownRow = {
  day: string;
  measured: boolean;
  remaining_tasks: number;
  remaining_seconds: string;
};

type PersonRow = {
  user_id: string | null;
  name: string | null;
  image: string | null;
  seconds: string;
};

/**
 * El informe de un ciclo: velocidad, burndown y horas por persona.
 *
 * Es el criterio de aceptacion de la Fase 6 —«cierras un sprint y ves velocidad
 * real y horas por persona»— y por eso las tres cosas salen de la misma llamada:
 * pedirlas por separado invitaria a que la pantalla enseñe tres numeros que no
 * cuadran entre si.
 *
 * **El burndown se dibuja sobre el alcance actual del ciclo.** Riuna no guarda
 * cuando entro cada tarea en el sprint, asi que una tarea añadida a mitad
 * aparece como si hubiera estado desde el principio. Es deuda declarada: la
 * alternativa —una tabla de instantaneas diarias— es un segundo mecanismo para
 * lo mismo, y la regla de tres pide uno. Ver ADR 025.
 */
async function getCycleReport(cycleId: string) {
  const cycle = await db.query.cycleTable.findFirst({
    where: eq(cycleTable.id, cycleId),
  });

  if (!cycle) {
    throw new HTTPException(404, { message: "Cycle not found" });
  }

  // Hasta donde se ha medido de verdad: un ciclo cerrado no sigue cambiando.
  const asOf = cycle.closedAt ?? new Date();
  // La serie llega siempre al final planificado —para que la linea ideal se vea
  // entera— y se estira si el ciclo se paso de fecha.
  const seriesEnd = asOf > cycle.endDate ? asOf : cycle.endDate;

  const [summaryRow] = await db
    .select({
      totalTasks: sql<number>`COUNT(*)::int`,
      doneTasks: sql<number>`COUNT(*) FILTER (WHERE ${taskTable.completedAt} IS NOT NULL)::int`,
      estimateSeconds: sql<string>`COALESCE(SUM(${taskTable.estimate}), 0)::bigint`,
      doneEstimateSeconds: sql<string>`COALESCE(SUM(${taskTable.estimate}) FILTER (WHERE ${taskTable.completedAt} IS NOT NULL), 0)::bigint`,
    })
    .from(taskTable)
    .where(
      and(eq(taskTable.cycleId, cycleId), ne(taskTable.status, "archived")),
    );

  // Los dias del burndown son los de la zona del servidor, como "hoy" en el
  // resto de Riuna (ADR 049): en UTC, lo cerrado entre las 00:00 y las 02:00 de
  // Madrid contaba en la vispera, y el punto de hoy no se media hasta las 02:00.
  const startDay = serverWallTime(
    sql`${cycle.startDate.toISOString()}::timestamp`,
  );
  const endDay = serverWallTime(sql`${seriesEnd.toISOString()}::timestamp`);
  const asOfDay = serverWallTime(sql`${asOf.toISOString()}::timestamp`);
  const completedAt = serverWallTime(sql`s."completed_at"`);

  const burndown = await db.execute<BurndownRow>(sql`
    WITH scope AS (
      SELECT t."id", t."estimate", t."completed_at"
      FROM "task" t
      WHERE t."cycle_id" = ${cycleId} AND t."status" <> 'archived'
    ),
    days AS (
      SELECT generate_series(
        date_trunc('day', ${startDay}),
        date_trunc('day', ${endDay}),
        interval '1 day'
      ) AS day
    )
    SELECT
      to_char(d.day, 'YYYY-MM-DD') AS day,
      (d.day <= date_trunc('day', ${asOfDay})) AS measured,
      COUNT(s."id") FILTER (
        WHERE s."completed_at" IS NULL
           OR ${completedAt} >= d.day + interval '1 day'
      )::int AS remaining_tasks,
      COALESCE(SUM(s."estimate") FILTER (
        WHERE s."completed_at" IS NULL
           OR ${completedAt} >= d.day + interval '1 day'
      ), 0)::bigint AS remaining_seconds
    FROM days d
    LEFT JOIN scope s ON true
    GROUP BY d.day
    ORDER BY d.day
  `);

  // Horas por persona: se atribuyen por pertenencia de la tarea al ciclo, no
  // por la fecha del registro. Si alguien apunta hoy una hora de una tarea del
  // sprint pasado, cuenta en el sprint de esa tarea, que es donde estaba el
  // trabajo.
  const people = await db.execute<PersonRow>(sql`
    SELECT
      te."user_id",
      u."name",
      u."image",
      COALESCE(SUM(te."duration"), 0)::bigint AS seconds
    FROM "time_entry" te
    JOIN "task" t ON t."id" = te."task_id"
    LEFT JOIN "user" u ON u."id" = te."user_id"
    WHERE t."cycle_id" = ${cycleId} AND t."status" <> 'archived'
    GROUP BY te."user_id", u."name", u."image"
    HAVING COALESCE(SUM(te."duration"), 0) > 0
    ORDER BY seconds DESC
  `);

  const totalTasks = summaryRow?.totalTasks ?? 0;
  const estimateSeconds = Number(summaryRow?.estimateSeconds ?? 0);
  const loggedSeconds = people.rows.reduce(
    (total, row) => total + Number(row.seconds),
    0,
  );

  const series = burndown.rows.map((row, index) => {
    const lastIndex = burndown.rows.length - 1;
    // Linea ideal: recta del total al cero a lo largo del ciclo. Con un solo
    // dia no hay pendiente que trazar.
    const progress = lastIndex > 0 ? index / lastIndex : 1;

    return {
      day: row.day,
      remainingTasks: row.measured ? row.remaining_tasks : null,
      remainingSeconds: row.measured ? Number(row.remaining_seconds) : null,
      idealTasks: Math.round(totalTasks * (1 - progress)),
      idealSeconds: Math.round(estimateSeconds * (1 - progress)),
    };
  });

  return {
    cycle,
    summary: {
      totalTasks,
      doneTasks: summaryRow?.doneTasks ?? 0,
      estimateSeconds,
      doneEstimateSeconds: Number(summaryRow?.doneEstimateSeconds ?? 0),
      loggedSeconds,
    },
    burndown: series,
    hoursByPerson: people.rows.map((row) => ({
      userId: row.user_id,
      name: row.name,
      image: row.image,
      seconds: Number(row.seconds),
    })),
  };
}

/** La velocidad de los ciclos ya cerrados: lo que dice cuanto cabe en el siguiente. */
export async function getVelocityHistory(projectId: string, limit = 6) {
  const rows = await db
    .select({
      id: cycleTable.id,
      name: cycleTable.name,
      closedAt: cycleTable.closedAt,
      doneTasks: sql<number>`(
        SELECT COUNT(*)::int FROM "task" t
        WHERE t."cycle_id" = "cycle"."id" AND t."status" <> 'archived'
          AND t."completed_at" IS NOT NULL
      )`,
      doneEstimateSeconds: sql<string>`(
        SELECT COALESCE(SUM(t."estimate"), 0)::bigint FROM "task" t
        WHERE t."cycle_id" = "cycle"."id" AND t."status" <> 'archived'
          AND t."completed_at" IS NOT NULL
      )`,
    })
    .from(cycleTable)
    .where(
      and(
        eq(cycleTable.projectId, projectId),
        eq(cycleTable.status, "closed"),
        isNotNull(cycleTable.closedAt),
      ),
    )
    .orderBy(sql`${cycleTable.closedAt} DESC`)
    .limit(limit);

  // Del mas antiguo al mas reciente: una grafica de velocidad se lee hacia
  // adelante, pero la consulta pide los ultimos.
  return rows
    .map((row) => ({
      ...row,
      doneEstimateSeconds: Number(row.doneEstimateSeconds),
    }))
    .reverse();
}

export default getCycleReport;
