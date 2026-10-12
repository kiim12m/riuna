import { createRequire } from "node:module";
import { API_URL, expect, test } from "./fixtures";

// El estado de la instancia (ADR 075) es del admin de instancia, y los usuarios
// del humo son personas normales: se promueve uno por la base. Contra una
// instancia ya en marcha (el simulacro) no hay base a mano, y se salta.
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

async function makeInstanceAdmin(userId: string) {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    await client.query(`UPDATE "user" SET role = 'admin' WHERE id = $1`, [
      userId,
    ]);
  } finally {
    await client.end();
  }
}

test.describe("Estado de la instancia", () => {
  test.skip(
    Boolean(process.env.E2E_BASE_URL),
    "necesita la base del humo para promover al admin",
  );

  test("el admin de instancia lo abre desde el avatar y ve trabajos, rutas y su IP", async ({
    page,
    riuna,
    baseURL,
  }) => {
    await page.goto(`/dashboard/workspace/${riuna.workspaceId}/today`);
    await page.getByRole("button", { name: "E2", exact: true }).click();
    await expect(
      page.getByRole("menuitem", { name: "Estado de la instancia" }),
    ).toHaveCount(0);
    await page.keyboard.press("Escape");

    await makeInstanceAdmin(riuna.userId);
    // La sesión guarda el rol en su cookie: se vuelve a entrar para verlo.
    await page.request.post(`${API_URL}/api/auth/sign-in/email`, {
      headers: {
        "content-type": "application/json",
        Origin: baseURL ?? "http://localhost:5174",
      },
      data: { email: riuna.email, password: "E2e-passw0rd!" },
    });

    await page.goto(`/dashboard/workspace/${riuna.workspaceId}/today`);
    await page.getByRole("button", { name: "E2", exact: true }).click();
    await page
      .getByRole("menuitem", { name: "Estado de la instancia" })
      .click();

    await expect(page).toHaveURL(/\/admin\/instance$/);
    await expect(
      page.getByRole("heading", { name: "Trabajos programados" }),
    ).toBeVisible({ timeout: 20_000 });
    await expect(
      page.getByRole("heading", { name: "Rutas más lentas" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Tu IP, según la API" }),
    ).toBeVisible();
    await expect(page.getByText("Base de datos")).toBeVisible();
  });
});
