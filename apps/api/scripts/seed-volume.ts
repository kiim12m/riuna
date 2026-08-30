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
  fieldDefinitionTable,
  labelTable,
  projectTable,
  taskTable,
  userTable,
  workspaceTable,
  workspaceUserTable,
} from "../src/database/schema";

const TOTAL_TASKS = Number(process.env.SEED_TASKS ?? 50_000);
const PROJECTS = Number(process.env.SEED_PROJECTS ?? 5);
const MAX_DEPTH = 5;
const INSERT_BATCH = 1_000;

const PRIORITIES = ["urgent", "high", "medium", "low", "no-priority"];
const STATUSES = ["to-do", "in-progress", "in-review", "done"];

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

/** Determinista a proposito: dos siembras dan el mismo reparto. */
function pseudoRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
    return state / 2_147_483_648;
  };
}

async function main() {
  const name = assertBenchDatabase();
  const started = Date.now();
  const random = pseudoRandom(42);

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
          priority: PRIORITIES[Math.floor(random() * PRIORITIES.length)],
          number,
          position: number,
          estimate: Math.floor(random() * 28_800),
          dueDate: new Date(
            Date.now() + Math.floor(random() * 90) * 86_400_000,
          ),
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

  const elapsed = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`\nListo: ${seeded} tareas en ${elapsed}s.`);
  console.log(`Espacio de trabajo: ${workspaceId}`);

  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
