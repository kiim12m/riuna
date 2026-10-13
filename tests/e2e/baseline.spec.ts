import { createRequire } from "node:module";
import { createTask, expect, test } from "./fixtures";
import { plusDays, upcomingMonday } from "./schedule-dates";

// La linea base (ADR 085) compara con el pasado, y por la API todo nace ahora:
// la tarea «de antes» se fecha por la base. Contra una instancia ya en marcha
// (el simulacro) no hay base a mano, y se salta.
const requireFromApi = createRequire(
  new URL("../../apps/api/package.json", import.meta.url),
);
type PgClient = {
  connect: () => Promise<void>;
  query: (text: string, values?: unknown[]) => Promise<unknown>;
  end: () => Promise<void>;
};
const { Client } = requireFromApi("pg") as {
  Client: new (options: { connectionString: string }) => PgClient;
};
const DATABASE_URL =
  process.env.E2E_DATABASE_URL ??
  "postgresql://postgres:postgres@localhost:5433/riuna_e2e_test";

async function backdate(taskId: string, days: number) {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    await client.query(
      `UPDATE "task" SET created_at = created_at - make_interval(days => $2) WHERE id = $1`,
      [taskId, days],
    );
    await client.query(
      `UPDATE "activity" SET created_at = created_at - make_interval(days => $2) WHERE task_id = $1`,
      [taskId, days],
    );
  } finally {
    await client.end();
  }
}

test.describe("Línea base", () => {
  test.skip(
    Boolean(process.env.E2E_BASE_URL),
    "necesita la base del humo para fechar el pasado",
  );

  test("la Tabla compara con ayer y el Gantt pinta la barra de entonces", async ({
    page,
    riuna,
  }) => {
    const monday = upcomingMonday();
    const old = await createTask(riuna, "Acometida", {
      priority: "low",
      startDate: monday.toISOString(),
      dueDate: plusDays(monday, 2).toISOString(),
    });
    await backdate(old, 3);
    await riuna.api("put", `/api/task/priority/${old}`, { priority: "high" });
    await riuna.api("put", `/api/task/due-date/${old}`, {
      dueDate: plusDays(monday, 4).toISOString(),
    });
    await createTask(riuna, "Cuadro nuevo");

    await page.goto(
      `/dashboard/workspace/${riuna.workspaceId}/project/${riuna.projectId}/table`,
    );
    await page.getByTestId("baseline-picker").click({ timeout: 30_000 });
    await page.getByRole("option", { name: "Ayer" }).click();
    await expect(page).toHaveURL(/baseline=yesterday/);

    await expect(page.getByTestId("baseline-summary")).toContainText(
      "1 entran · 0 salen · 1 cambian",
      { timeout: 30_000 },
    );
    const changed = page.getByRole("row").filter({ hasText: "Acometida" });
    await expect(changed.getByTestId("baseline-changed")).toBeVisible();
    await expect(changed.getByTestId("baseline-was").first()).toHaveText(
      "Baja",
    );
    await expect(
      page
        .getByRole("row")
        .filter({ hasText: "Cuadro nuevo" })
        .getByTestId("baseline-added"),
    ).toBeVisible();

    await page.goto(
      `/dashboard/workspace/${riuna.workspaceId}/project/${riuna.projectId}/gantt?baseline=yesterday`,
    );
    await expect(page.getByTestId("gantt-baseline-ghost")).toHaveCount(1, {
      timeout: 30_000,
    });
  });
});
