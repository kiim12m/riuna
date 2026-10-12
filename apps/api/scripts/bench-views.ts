/**
 * El p95 de las pantallas que llegaron después de la Fase 4.5, contra el banco
 * de 50.000 tareas (Fase 9, Bloque 5.3). `AGENTS.md` pide que toda vista
 * responda en menos de 300 ms p95 con ese volumen; la Fase 4.5 midió el árbol,
 * los filtros y el listado, y lo personal llegó después sin medir.
 *
 *   DATABASE_URL=postgresql://…/riuna_x_bench pnpm --filter @riuna/api db:seed:volume
 *   DATABASE_URL=postgresql://…/riuna_x_bench pnpm --filter @riuna/api exec tsx scripts/bench-views.ts
 *
 * Mide de punta a punta dentro del proceso: la app entera, con su middleware,
 * su autenticación y su base, sin la red. Usa a la persona con más tareas
 * asignadas, la hace responsable de un departamento (para «Mi equipo») y le
 * abre una sesión.
 *
 * Se niega a correr contra una base cuyo nombre no acabe en `_bench` o
 * `_test`, como el banco.
 */
import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";

process.env.RATE_LIMIT_ENABLED = "false";
process.env.LOG_LEVEL = "warn";

const { default: db } = await import("../src/database");
const { sessionTable, teamMemberTable, teamTable } = await import(
  "../src/database/schema"
);
const { createApp } = await import("../src/index");

const RUNS = Number(process.env.BENCH_RUNS ?? 30);
const WARMUP = 3;

const databaseName = new URL(process.env.DATABASE_URL ?? "").pathname.slice(1);
if (!/_(bench|test)$/.test(databaseName)) {
  console.error(
    `Me niego a medir contra «${databaseName}»: el nombre tiene que acabar en _bench o _test.`,
  );
  process.exit(1);
}

// La persona con más tareas asignadas, y su espacio.
const busiest = await db.execute<{ user_id: string; workspace_id: string }>(sql`
  SELECT ta.user_id, p.workspace_id
  FROM task_assignee ta
  JOIN task t ON t.id = ta.task_id
  JOIN project p ON p.id = t.project_id
  GROUP BY ta.user_id, p.workspace_id
  ORDER BY count(*) DESC
  LIMIT 1
`);
const subject = busiest.rows[0];
if (!subject) {
  console.error(
    "El banco no tiene tareas asignadas: siembra con db:seed:volume.",
  );
  process.exit(1);
}
const userId = subject.user_id;
const workspaceId = subject.workspace_id;

// Responsable de un departamento, para que «Mi equipo» tenga gente que mirar.
const [team] = await db
  .select({ id: teamTable.id })
  .from(teamTable)
  .where(eq(teamTable.workspaceId, workspaceId))
  .limit(1);
if (team) {
  const membership = await db
    .select()
    .from(teamMemberTable)
    .where(
      and(
        eq(teamMemberTable.teamId, team.id),
        eq(teamMemberTable.userId, userId),
      ),
    );
  if (membership.length === 0) {
    await db
      .insert(teamMemberTable)
      .values({ id: randomUUID(), teamId: team.id, userId });
  }
  await db
    .update(teamMemberTable)
    .set({ isLead: true })
    .where(
      and(
        eq(teamMemberTable.teamId, team.id),
        eq(teamMemberTable.userId, userId),
      ),
    );
}

// Una sesión de verdad: el plugin `bearer` acepta el token tal cual.
const token = `bench-${randomUUID()}`;
await db.insert(sessionTable).values({
  id: randomUUID(),
  token,
  userId,
  expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  createdAt: new Date(),
  updatedAt: new Date(),
  activeOrganizationId: workspaceId,
});

const { app } = createApp();
const headers = { Authorization: `Bearer ${token}` };

async function call(method: "GET" | "POST", path: string) {
  const response = await app.request(path, { method, headers });
  if (!response.ok) {
    throw new Error(
      `${method} ${path} -> ${response.status} ${await response.text()}`,
    );
  }
  return response;
}

const dashboards = (await (
  await call("GET", `/api/dashboard?workspaceId=${workspaceId}`)
).json()) as Array<{ id: string }>;
const dashboardId = dashboards[0]?.id;

const today = new Date().toISOString().slice(0, 10);
const w = `workspaceId=${workspaceId}`;
// Las automatizaciones no están: su coste es el número de reglas, no el de
// tareas, y se midió en la ADR 068. El plan personal tampoco se siembra: tiene
// decenas de entradas, no miles, así que Hoy, el Planificador y el Cronograma
// miden aquí lo que sí crece con el volumen, lo vencido y lo sin planificar.
const views: Array<[string, "GET" | "POST", string]> = [
  ["Hoy", "GET", `/api/today?${w}`],
  ["Planificador (7 días)", "GET", `/api/planner?${w}`],
  ["Cronograma (7 días)", "GET", `/api/schedule?${w}`],
  ["Mis tareas: contadores", "GET", `/api/my-work/counts?${w}`],
  ["Mis tareas: asignadas", "GET", `/api/my-work/tasks?${w}&scope=assigned`],
  ["Mis tareas: del departamento", "GET", `/api/my-work/tasks?${w}&scope=team`],
  ["Mis tareas: esperando", "GET", `/api/my-work/waiting?${w}`],
  ["Mi equipo: el día", "GET", `/api/lead/day?${w}&date=${today}`],
  ["Mi equipo: stand-up", "GET", `/api/lead/standup?${w}`],
  ["Búsqueda", "GET", `/api/search?${w}&q=tarea`],
];
if (dashboardId) {
  views.push([
    "Mi panel (todos los widgets)",
    "POST",
    `/api/dashboard/${dashboardId}/data`,
  ]);
}

function percentile(sorted: number[], p: number) {
  return (
    sorted[
      Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)
    ] ?? 0
  );
}

console.log(
  `\nBanco «${databaseName}», ${RUNS} vueltas por pantalla tras ${WARMUP} de calentamiento\n`,
);
console.log("| Pantalla | p50 | p95 | máx | |");
console.log("|---|---|---|---|---|");
for (const [name, method, path] of views) {
  try {
    for (let i = 0; i < WARMUP; i += 1) await call(method, path);
    const times: number[] = [];
    for (let i = 0; i < RUNS; i += 1) {
      const started = performance.now();
      await (await call(method, path)).arrayBuffer();
      times.push(performance.now() - started);
    }
    times.sort((a, b) => a - b);
    const p95 = percentile(times, 95);
    console.log(
      `| ${name} | ${percentile(times, 50).toFixed(0)} ms | ${p95.toFixed(0)} ms | ${(times.at(-1) ?? 0).toFixed(0)} ms | ${p95 < 300 ? "✔" : "✘"} |`,
    );
  } catch (error) {
    console.log(
      `| ${name} | — | — | — | ${(error as Error).message.slice(0, 80)} |`,
    );
  }
}

await db.delete(sessionTable).where(eq(sessionTable.token, token));
process.exit(0);
