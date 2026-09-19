/**
 * Siembra un espacio de trabajo con volumen para medir el presupuesto de
 * rendimiento: 50.000 tareas, arboles de hasta 5 niveles, campos personalizados
 * poblados y etiquetas.
 *
 * `AGENTS.md` lo pide desde la Fase 2 —«toda vista nueva pagina y responde en
 * menos de 300 ms p95 con 50.000 tareas, comprobado con EXPLAIN»— y hasta la
 * Fase 4.5 no existia, asi que las conclusiones de rendimiento eran
 * razonamiento sobre el plan esperado y no medicion.
 *
 *   DATABASE_URL=postgresql://... pnpm --filter @riuna/api db:seed:volume
 *
 * Se niega a correr contra una base cuyo nombre no acabe en `_bench` o `_test`,
 * por el mismo motivo que las pruebas de integracion: `AGENTS.md` prohibe usar
 * datos de produccion para desarrollo.
 */
import { createId } from "@paralleldrive/cuid2";
import { sql } from "drizzle-orm";
import db from "../src/database";
import {
  columnTable,
  epicTable,
  fieldDefinitionTable,
  labelTable,
  projectTable,
  taskAssigneeTable,
  taskEpicTable,
  taskTable,
  teamMemberTable,
  teamTable,
  timeEntryTable,
  userTable,
  workspaceTable,
  workspaceUserTable,
} from "../src/database/schema";

/**
 * Version del reparto sembrado. La 2 la trae la Fase 7: fechas de vencimiento
 * tambien en el pasado, `completed_at` repartido sobre un ano, y filas de
 * `time_entry`, `epic` y `task_epic`.
 *
 * **Las cifras medidas antes de la v2 no son comparables** para nada que
 * dependa de fechas: la v1 sembraba todo el vencimiento en el futuro, asi que
 * "vencidas" devolvia cero filas, y sellaba todos los `completed_at` en el
 * instante de la siembra. Los recuentos de `task` no cambian, asi que las
 * mediciones del arbol y del `path` siguen siendo comparables.
 */
const SEED_VERSION = 2;

const TOTAL_TASKS = Number(process.env.SEED_TASKS ?? 50_000);
const PROJECTS = Number(process.env.SEED_PROJECTS ?? 5);
const MAX_DEPTH = 5;
const INSERT_BATCH = 1_000;

const PRIORITIES = ["urgent", "high", "medium", "low", "no-priority"];
const STATUSES = ["to-do", "in-progress", "in-review", "done"];

// Reparto entre personas y departamentos, que es lo que "Mi trabajo" consulta.
// El banco nacio en la Fase 4.5, cuando no habia ninguna vista que cruzase
// proyectos; sin estas filas las dos consultas de la Fase 6 devuelven cero y
// medirlas no dice nada.
const USERS = 10;
const TEAMS = 3;
/** Que parte de las tareas lleva departamento. El resto se queda sin. */
const TEAM_SHARE = 0.4;

// Epicas y registro de tiempo, que es lo que los widgets de la Fase 7 leen.
// Sin estas filas dos de los seis tipos miden una tabla vacia.
const EPICS_PER_PROJECT = Number(process.env.SEED_EPICS ?? 8);
/** Que parte de las tareas entra en una epica. */
const EPIC_SHARE = 0.6;
/**
 * Y que parte de esas entra ademas en una **segunda**. Es deliberado: el
 * agregado por epica agrupa sobre `task_epic`, cuyo grano multiplica las
 * tareas, asi que los cubos suman por encima del total. Que el banco lo
 * reproduzca es lo que hace que eso salga en una prueba y no en produccion.
 */
const EPIC_SECOND_SHARE = 0.1;
/** Que parte de las tareas tiene una entrada de tiempo. */
const TIME_ENTRY_SHARE = Number(process.env.SEED_TIME_ENTRY_SHARE ?? 0.3);

/** Sobre cuantos dias hacia atras se reparten cierres y registros de tiempo. */
const HISTORY_DAYS = 365;
const DAY_MS = 86_400_000;

function assertBenchDatabase() {
  const url = process.env.DATABASE_URL;

  if (!url) {
    throw new Error("DATABASE_URL is required");
  }

  const name = new URL(url).pathname.replace(/^\//, "");

  if (!name.endsWith("_bench") && !name.endsWith("_test")) {
    throw new Error(
      `Refusing to seed "${name}": the database name must end in _bench or _test`,
    );
  }

  return name;
}

/**
 * Determinista a proposito: dos siembras dan el mismo reparto.
 *
 * **Regla: la aleatoriedad nueva sale de un generador nuevo.** Es un unico
 * flujo consumido en orden, asi que una extraccion de mas metida en medio del
 * bucle desplaza todas las siguientes y convierte en cifras sobre otra base
 * todo lo ya medido —«Mi trabajo» 197→47 ms, el arbol 6.769→36 ms, el cruce
 * del presupuesto a ~6.500 tareas—. El flujo `random` esta congelado.
 */
function pseudoRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
    return state / 2_147_483_648;
  };
}

/**
 * Reparte el vencimiento entre -90 y +89 dias a partir de la misma extraccion
 * que ya decidio que la tarea tiene fecha, reescalando el tramo [0,2; 1) para
 * no perder resolucion en el pasado.
 */
function dueDateFromDraw(draw: number) {
  const scaled = (draw - 0.2) / 0.8;
  return new Date(Date.now() + (Math.floor(scaled * 180) - 90) * DAY_MS);
}

async function main() {
  const name = assertBenchDatabase();
  const started = Date.now();
  const random = pseudoRandom(42);
  // Flujo aparte para las fechas de la v2, para no desplazar el de arriba.
  const clock = pseudoRandom(1337);

  console.log(`Sembrando ${TOTAL_TASKS} tareas en "${name}"...`);

  const workspaceId = `workspace-${createId()}`;
  const userId = `user-${createId()}`;

  await db.insert(userTable).values({
    id: userId,
    email: `bench-${createId()}@example.com`,
    emailVerified: true,
    name: "Banco de pruebas",
  });

  await db.insert(workspaceTable).values({
    id: workspaceId,
    name: "Banco de pruebas",
    slug: `bench-${createId()}`,
    createdAt: new Date(),
  });

  await db.insert(workspaceUserTable).values({
    workspaceId,
    userId,
    role: "owner",
    joinedAt: new Date(),
  });

  // Una plantilla pequena y tres departamentos. `userId` —la persona con la que
  // se mide— es la posicion 0 del reparto y pertenece al equipo 0, asi que le
  // toca aproximadamente una decima parte de las tareas asignadas y su equipo
  // es el mas cargado: es el caso que el presupuesto tiene que aguantar.
  const teammateIds = Array.from(
    { length: USERS - 1 },
    () => `user-${createId()}`,
  );
  const memberIds = [userId, ...teammateIds];

  await db.insert(userTable).values(
    teammateIds.map((id, index) => ({
      id,
      email: `bench-${index}-${createId()}@example.com`,
      emailVerified: true,
      name: `Persona ${index + 1}`,
    })),
  );

  await db.insert(workspaceUserTable).values(
    teammateIds.map((id) => ({
      workspaceId,
      userId: id,
      role: "member",
      joinedAt: new Date(),
    })),
  );

  const teamIds = Array.from({ length: TEAMS }, () => `team-${createId()}`);

  await db.insert(teamTable).values(
    teamIds.map((id, index) => ({
      id,
      workspaceId,
      name: `Departamento ${index + 1}`,
      createdAt: new Date(),
    })),
  );

  await db.insert(teamMemberTable).values(
    memberIds.map((member, index) => ({
      id: `tm-${createId()}`,
      teamId: teamIds[index % TEAMS],
      userId: member,
    })),
  );

  // Dos campos personalizados: uno numerico —el `Presupuesto > 1000` que el
  // plan usa de ejemplo— y uno de seleccion multiple, que es el unico que usa
  // contencion y por tanto el GIN.
  await db.insert(fieldDefinitionTable).values([
    {
      workspaceId,
      projectId: null,
      key: "presupuesto",
      name: "Presupuesto",
      type: "number",
      config: {},
      position: 0,
    },
    {
      workspaceId,
      projectId: null,
      key: "areas",
      name: "Areas",
      type: "multi_select",
      config: {
        options: ["obra", "legal", "compras", "it"].map((value) => ({
          value,
          label: value,
        })),
      },
      position: 1,
    },
  ]);

  const perProject = Math.ceil(TOTAL_TASKS / PROJECTS);
  let seeded = 0;

  for (let p = 0; p < PROJECTS; p += 1) {
    const [project] = await db
      .insert(projectTable)
      .values({
        workspaceId,
        name: `Proyecto ${p + 1}`,
        icon: "Folder",
        slug: `bench-${p + 1}-${createId()}`,
      })
      .returning();

    const columns = await db
      .insert(columnTable)
      .values(
        STATUSES.map((slug, index) => ({
          projectId: project.id,
          name: slug,
          slug,
          position: index,
          isFinal: slug === "done",
        })),
      )
      .returning();

    const columnBySlug = new Map(columns.map((c) => [c.slug, c.id]));

    const epics = await db
      .insert(epicTable)
      .values(
        Array.from({ length: EPICS_PER_PROJECT }, (_, index) => ({
          projectId: project.id,
          name: `Epica ${index + 1} del proyecto ${p + 1}`,
          position: index,
        })),
      )
      .returning({ id: epicTable.id });

    // Se guardan las tareas por nivel para poder colgar de ellas el siguiente.
    let previousLevel: { id: string; path: string; depth: number }[] = [];
    let number = 1;
    const projectTarget = Math.min(perProject, TOTAL_TASKS - seeded);

    for (let depth = 0; depth < MAX_DEPTH && number <= projectTarget; depth++) {
      // Reparto piramidal: la mitad de lo que quede en cada nivel, para que
      // haya ramas desiguales y no un arbol perfecto.
      const remaining = projectTarget - (number - 1);
      const levelSize =
        depth === MAX_DEPTH - 1 ? remaining : Math.ceil(remaining / 2);

      const rows: (typeof taskTable.$inferInsert)[] = [];
      const currentLevel: { id: string; path: string; depth: number }[] = [];

      for (let i = 0; i < levelSize; i += 1) {
        const id = createId();
        const parent =
          depth === 0 || previousLevel.length === 0
            ? null
            : previousLevel[Math.floor(random() * previousLevel.length)];

        const path = parent ? `${parent.path}${id}/` : `/${id}/`;
        const status = STATUSES[Math.floor(random() * STATUSES.length)];
        const assigneeId = memberIds[Math.floor(random() * USERS)];
        const teamId =
          random() < TEAM_SHARE ? teamIds[Math.floor(random() * TEAMS)] : null;
        const dueDraw = random();

        rows.push({
          id,
          parentId: parent?.id ?? null,
          path,
          depth,
          projectId: project.id,
          title: `Tarea ${number} del proyecto ${p + 1}`,
          description: "",
          status,
          columnId: columnBySlug.get(status) ?? null,
          userId: assigneeId,
          teamId,
          priority: PRIORITIES[Math.floor(random() * PRIORITIES.length)],
          number,
          position: number,
          estimate: Math.floor(random() * 28_800),
          // Una sola extraccion, como la v1, para no mover el flujo: la misma
          // decide si la tarea tiene fecha y cual. A ambos lados de hoy porque
          // sembrando solo futuro "vencidas" devolvia cero filas y no habia
          // nada que medir.
          dueDate: dueDraw < 0.2 ? null : dueDateFromDraw(dueDraw),
          // El disparador sella `now()` al insertar si no se le da valor, asi
          // que la v1 amontonaba todos los cierres en el mismo instante y una
          // tendencia media un solo cubo. Darselo explicito es lo que la
          // ADR 025 permite: "manda sobre el *si*, no sobre el *cuando*".
          completedAt:
            status === "done"
              ? new Date(
                  Date.now() - Math.floor(clock() * HISTORY_DAYS) * DAY_MS,
                )
              : null,
          customFields: {
            presupuesto: Math.floor(random() * 20_000),
            areas: random() > 0.5 ? ["obra"] : ["legal", "it"],
          },
        });

        currentLevel.push({ id, path, depth });
        number += 1;

        if (number > projectTarget) break;
      }

      for (let i = 0; i < rows.length; i += INSERT_BATCH) {
        await db.insert(taskTable).values(rows.slice(i, i + INSERT_BATCH));
      }

      // `task_assignee` refleja siempre al responsable principal, que es lo que
      // `syncPrimaryAssignee` garantiza en produccion. Sin estas filas el banco
      // mentiria: "Mi trabajo" lee esta tabla, no `assignee_id`.
      for (let i = 0; i < rows.length; i += INSERT_BATCH) {
        await db.insert(taskAssigneeTable).values(
          rows.slice(i, i + INSERT_BATCH).map((task) => ({
            taskId: task.id as string,
            userId: task.userId as string,
          })),
        );
      }

      // Pertenencia a epica, con un 10 % de las tareas en dos. La segunda es
      // deliberada: el agregado por epica agrupa sobre `task_epic`, cuyo grano
      // multiplica las tareas.
      const epicRows: (typeof taskEpicTable.$inferInsert)[] = [];

      for (const task of rows) {
        if (clock() >= EPIC_SHARE) continue;
        const first = Math.floor(clock() * epics.length);
        epicRows.push({ taskId: task.id as string, epicId: epics[first].id });

        if (clock() < EPIC_SECOND_SHARE) {
          const second = (first + 1) % epics.length;
          epicRows.push({
            taskId: task.id as string,
            epicId: epics[second].id,
          });
        }
      }

      for (let i = 0; i < epicRows.length; i += INSERT_BATCH) {
        await db
          .insert(taskEpicTable)
          .values(epicRows.slice(i, i + INSERT_BATCH));
      }

      // Registro de tiempo, repartido sobre el mismo ano que los cierres: sin
      // el, el widget de tiempo registrado mide una tabla vacia.
      const timeRows: (typeof timeEntryTable.$inferInsert)[] = [];

      for (const task of rows) {
        if (clock() >= TIME_ENTRY_SHARE) continue;
        const startTime = new Date(
          Date.now() - Math.floor(clock() * HISTORY_DAYS) * DAY_MS,
        );
        const duration = 900 + Math.floor(clock() * 13_500);
        timeRows.push({
          taskId: task.id as string,
          userId: memberIds[Math.floor(clock() * USERS)],
          startTime,
          // Cerrada siempre: una entrada en marcha tiene duracion 0 y saltaria
          // al pararla, que es ruido en una medicion.
          endTime: new Date(startTime.getTime() + duration * 1000),
          duration,
        });
      }

      for (let i = 0; i < timeRows.length; i += INSERT_BATCH) {
        await db
          .insert(timeEntryTable)
          .values(timeRows.slice(i, i + INSERT_BATCH));
      }

      // Una etiqueta en una de cada diez, para que el filtro por etiqueta tenga
      // trabajo real que hacer.
      const labelled = currentLevel.filter((_, index) => index % 10 === 0);

      for (let i = 0; i < labelled.length; i += INSERT_BATCH) {
        const slice = labelled.slice(i, i + INSERT_BATCH);
        if (slice.length === 0) continue;
        await db.insert(labelTable).values(
          slice.map((task) => ({
            workspaceId,
            taskId: task.id,
            name: "urgente",
            color: "#ff0000",
          })),
        );
      }

      previousLevel = currentLevel;
      seeded += currentLevel.length;
      console.log(
        `  proyecto ${p + 1}, nivel ${depth}: ${currentLevel.length} tareas (${seeded} en total)`,
      );
    }

    await db
      .update(projectTable)
      .set({ lastTaskNumber: number - 1 })
      .where(sql`${projectTable.id} = ${project.id}`);
  }

  console.log("ANALYZE...");
  await db.execute(sql`ANALYZE "task"`);
  await db.execute(sql`ANALYZE "label"`);
  await db.execute(sql`ANALYZE "task_assignee"`);
  await db.execute(sql`ANALYZE "team_member"`);
  await db.execute(sql`ANALYZE "project"`);
  await db.execute(sql`ANALYZE "column"`);
  await db.execute(sql`ANALYZE "epic"`);
  await db.execute(sql`ANALYZE "task_epic"`);
  await db.execute(sql`ANALYZE "time_entry"`);

  const elapsed = ((Date.now() - started) / 1000).toFixed(1);
  console.log(
    `\nListo: ${seeded} tareas en ${elapsed}s (reparto v${SEED_VERSION}).`,
  );
  console.log(`Espacio de trabajo: ${workspaceId}`);
  console.log(`Usuario de medicion: ${userId} (equipo ${teamIds[0]})`);

  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
