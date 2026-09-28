import { createTask, expect, test } from "./fixtures";

/**
 * La paleta de datos, contra un navegador de verdad.
 *
 * Existe por una regresion que **ninguna prueba sobre el DOM podia ver**: las
 * barras tenian su anchura correcta y su `style` en su sitio, y aun asi cuatro
 * de cada cinco se pintaban negras. `chartColor` construia
 * `var(--color-chart-N)` en tiempo de ejecucion, y Tailwind poda de
 * `@theme inline` toda variable que ninguna fuente nombre literalmente: solo
 * sobrevivia el 1 —el unico escrito a pelo en el codigo— y las demas resolvian
 * a transparente.
 *
 * Por eso esto se afirma sobre el **color computado**, nunca sobre clases ni
 * sobre el atributo `style`: los dos estaban bien mientras el fallo estaba ahi.
 */

/** Pone el tema antes de que arranque la aplicacion, como lo hace el usuario. */
async function conTema(page: import("@playwright/test").Page, tema: string) {
  await page.addInitScript((valor) => {
    localStorage.setItem(
      "user-preferences",
      JSON.stringify({ state: { theme: valor }, version: 0 }),
    );
  }, tema);
}

const SLOTS = 8;

test.describe("Paleta de datos", () => {
  for (const tema of ["light", "dark"]) {
    test(`resolves every chart token in the ${tema} theme`, async ({
      page,
      riuna,
    }) => {
      await conTema(page, tema);
      await page.goto(`/dashboard/workspace/${riuna.workspaceId}/home`);
      await expect(
        page.getByRole("region", { name: "Vencidas" }),
      ).toBeVisible();

      const tokens = await page.evaluate((slots) => {
        const estilo = getComputedStyle(document.documentElement);
        const leer = (nombre: string) => estilo.getPropertyValue(nombre).trim();
        const series = Array.from({ length: slots }, (_, i) =>
          leer(`--chart-${i + 1}`),
        );
        return { series, otros: leer("--chart-other") };
      }, SLOTS);

      // Un token podado devuelve cadena vacia, que es exactamente como se
      // colaba el fallo: sin error, sin aviso, y con la barra en negro.
      for (const [indice, valor] of tokens.series.entries()) {
        expect(valor, `--chart-${indice + 1} sin valor`).not.toBe("");
      }
      expect(tokens.otros).not.toBe("");

      // Y cada serie tiene que ser un tono distinto, o dos series comparten
      // identidad y la leyenda deja de significar nada.
      expect(new Set(tokens.series).size).toBe(SLOTS);
    });
  }

  test("paints the breakdown bars with visible, distinct colours", async ({
    page,
    riuna,
  }) => {
    // Hace falta un reparto con barras de las que muestrear color. La
    // distribucion de partida ya no siembra ninguno —desde la ADR 043 son ocho
    // cifras, la semana y una lista—, asi que la prueba se crea el suyo. Y
    // hacen falta tareas en ventanas distintas o el reparto sale vacio y esto
    // no mira nada.
    const dia = (n: number) =>
      new Date(Date.now() + n * 86_400_000).toISOString();

    for (const [titulo, dias] of [
      ["Vencida", -3],
      ["Esta semana", 2],
      ["Mas adelante", 30],
    ] as const) {
      const id = await createTask(riuna, titulo, { dueDate: dia(dias) });
      await riuna.api("put", `/api/task/assignee/${id}`, {
        userId: riuna.userId,
      });
    }

    const paneles = await riuna.api<Array<{ id: string; createdBy: string }>>(
      "get",
      `/api/dashboard?workspaceId=${riuna.workspaceId}`,
    );
    const propio = paneles.find((panel) => panel.createdBy === riuna.userId);

    await riuna.api("post", `/api/dashboard/${propio?.id}/widget`, {
      type: "breakdown",
      title: "Vencimientos",
      config: { scope: "assigned", groupBy: "dueWindow" },
    });

    await page.goto(`/dashboard/workspace/${riuna.workspaceId}/home`);

    const vencimientos = page.getByRole("region", { name: "Vencimientos" });
    await expect(vencimientos).toBeVisible();

    const rellenos = await vencimientos.evaluate((region) =>
      [...region.querySelectorAll<HTMLElement>("[style*='--chart-']")].map(
        (nodo) => getComputedStyle(nodo).backgroundColor,
      ),
    );

    expect(rellenos.length).toBeGreaterThan(0);

    for (const color of rellenos) {
      expect(color, "una barra sin color es una barra negra").not.toBe(
        "rgba(0, 0, 0, 0)",
      );
      expect(color).not.toBe("transparent");
    }

    expect(new Set(rellenos).size).toBe(rellenos.length);
  });
});
