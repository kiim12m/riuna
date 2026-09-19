import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { proposeMapping } from "../../apps/api/src/task/exchange/map-rows";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";

/**
 * Medicion del criterio de aceptacion de la Fase 5: importar un fichero de
 * 5.000 filas con jerarquia, y **reimportarlo**, que es el camino de
 * actualizacion y no se habia medido nunca.
 *
 * La linea base es la de la Fase 4.5: 5.000 filas en 7,1 s con el importador
 * anterior, que no llevaba jerarquia, ni epicas, ni campos, ni idempotencia.
 *
 * Se salta por defecto: son decenas de segundos y no aporta nada en cada
 * commit. Para correrla:
 *
 *   RUN_BENCH=1 DATABASE_URL="postgresql://riuna@localhost:5433/riuna_test" \
 *     pnpm exec vitest run --config vitest.integration.config.ts task-import-benchmark
 */

const ENABLED = process.env.RUN_BENCH === "1";
const ROWS = Number(process.env.BENCH_ROWS ?? 5_000);

describe.skipIf(!ENABLED)("benchmark: importing a large spreadsheet", () => {
  let app: ReturnType<typeof createApp>["app"];
  let projectId: string;
  let file: string;

  beforeAll(async () => {
    await resetTestDatabase();

    const member = await createWorkspaceMember({ role: "admin" });
    const fixture = await createProjectFixture({
      workspaceId: member.workspace.id,
    });

    mockAuthenticatedSession(member.user);
    app = createApp().app;
    projectId = fixture.project.id;
    file = buildFile(ROWS);
  }, 120_000);

  it("imports and then reimports the same file", async () => {
    const firstStart = performance.now();
    const first = await send(app, projectId, file);
    const firstMs = performance.now() - firstStart;

    expect(first.results.created).toBe(ROWS);
    expect(first.results.failed).toBe(0);

    const secondStart = performance.now();
    const second = await send(app, projectId, file);
    const secondMs = performance.now() - secondStart;

    expect(second.results.created).toBe(0);
    expect(second.results.updated).toBe(ROWS);

    const tasks = await db
      .select({ id: schema.taskTable.id })
      .from(schema.taskTable)
      .where(eq(schema.taskTable.projectId, projectId));

    // La prueba de la idempotencia: dos importaciones, N tareas.
    expect(tasks).toHaveLength(ROWS);

    console.log(
      [
        "",
        `filas:               ${ROWS}`,
        `importar (alta):     ${(firstMs / 1000).toFixed(1)} s`,
        `reimportar (update): ${(secondMs / 1000).toFixed(1)} s`,
        "",
      ].join("\n"),
    );
  }, 600_000);
});

/**
 * Un fichero con arbol de tres niveles: una raiz por cada diez filas, con dos
 * hijas y siete nietas. Es la forma que el plan pide desde la Fase 2.
 */
function buildFile(rows: number): string {
  const header = [
    "Referencia",
    "Esquema",
    "Título",
    "Estado",
    "Prioridad",
    "Estimación (h)",
  ];

  const lines: string[][] = [];
  let root = 0;
  let child = 0;
  let grandchild = 0;

  for (let index = 0; index < rows; index += 1) {
    const position = index % 10;
    let outline: string;

    if (position === 0) {
      root += 1;
      child = 0;
      grandchild = 0;
      outline = String(root);
    } else if (position <= 2) {
      child += 1;
      grandchild = 0;
      outline = `${root}.${child}`;
    } else {
      grandchild += 1;
      outline = `${root}.${Math.max(child, 1)}.${grandchild}`;
    }

    lines.push([
      `BENCH-${index}`,
      outline,
      `Tarea ${index}`,
      "To Do",
      "Media",
      String((index % 8) + 1),
    ]);
  }

  const quote = (value: string) =>
    /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;

  return `﻿${[header, ...lines]
    .map((row) => row.map(quote).join(","))
    .join("\r\n")}\r\n`;
}

type Report = {
  results: { created: number; updated: number; failed: number };
};

async function send(
  app: ReturnType<typeof createApp>["app"],
  projectId: string,
  content: string,
): Promise<Report> {
  const header = content.replace(/^﻿/, "").split("\r\n")[0]?.split(",") ?? [];
  const form = new FormData();
  form.append("file", new File([content], "bench.csv", { type: "text/csv" }));
  form.append("mapping", JSON.stringify(proposeMapping(header)));

  const response = await app.request(`/api/task/import/${projectId}`, {
    method: "POST",
    body: form,
  });

  if (response.status !== 200) {
    throw new Error(`${response.status}: ${await response.text()}`);
  }

  return (await response.json()) as Report;
}
