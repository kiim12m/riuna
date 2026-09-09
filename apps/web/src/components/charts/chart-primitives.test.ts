import { describe, expect, it } from "vitest";
import { CHART_SLOTS, chartColor } from "./chart-primitives";

/**
 * El contrato de la paleta de datos.
 *
 * La regresion que estas pruebas fijan no se ve en el DOM: el elemento tenia su
 * anchura correcta y solo el **color computado** estaba mal, porque
 * `chartColor` construia `var(--color-chart-N)` en tiempo de ejecucion y
 * Tailwind poda de `@theme inline` toda variable que ninguna fuente nombre
 * literalmente. Sobrevivia el 1 y las demas series salian transparentes.
 *
 * Aqui se fija la forma del nombre; que el token exista de verdad en las dos
 * hojas de tema lo comprueba `tests/e2e/panel.spec.ts` contra un navegador,
 * que es el unico sitio donde hay CSS que computar.
 */
describe("chartColor", () => {
  it("apunta a --chart-N y nunca a la variante podada --color-chart-N", () => {
    for (let index = 0; index < CHART_SLOTS; index++) {
      expect(chartColor(index)).toBe(`var(--chart-${index + 1})`);
    }
  });

  it("da un tono distinto a cada serie de la paleta", () => {
    const tonos = new Set(
      Array.from({ length: CHART_SLOTS }, (_, index) => chartColor(index)),
    );

    expect(tonos.size).toBe(CHART_SLOTS);
  });

  it("no cicla: la cola cae en el neutro de «otros»", () => {
    // Repetir el tono haria que dos series distintas compartieran identidad,
    // que es peor que no distinguirlas.
    expect(chartColor(CHART_SLOTS)).toBe("var(--chart-other)");
    expect(chartColor(CHART_SLOTS + 40)).toBe("var(--chart-other)");
    expect(chartColor(CHART_SLOTS)).not.toBe(chartColor(0));
  });

  it("trata un indice negativo como cola, no como el ultimo tono", () => {
    expect(chartColor(-1)).toBe("var(--chart-other)");
  });
});
