import { describe, expect, it } from "vitest";
import {
  normalizeLookupKey,
  statusKeys,
} from "../../../../apps/api/src/task/exchange/lookups";

/**
 * Que una columna se deje reconocer por su nombre **y** por su slug.
 *
 * Las columnas por defecto pasaron a llamarse en castellano —«Por hacer», «En
 * curso»…, que es lo que fija `marca.md` §06— mientras el slug se queda en
 * ingles porque es lo que comparan `is_final`, el filtro de estado y la
 * definicion de «hecha». Sin colapsar separadores, una hoja que dijera «To Do»
 * daba la clave `to do` y el slug `to-do`: dos cosas distintas para la misma
 * columna, y la importacion dejaba de casar al traducir los nombres.
 */
describe("statusKeys", () => {
  it("hace caer juntos el slug y su forma con espacios", () => {
    const [, colapsada] = statusKeys("To Do");

    expect(statusKeys("to-do")).toContain(colapsada);
    expect(statusKeys("TO_DO")).toContain(colapsada);
    expect(statusKeys("todo")).toContain(colapsada);
  });

  it("mantiene la clave normal ademas de la colapsada", () => {
    expect(statusKeys("In Progress")).toEqual(["in progress", "inprogress"]);
  });

  it("no duplica cuando no hay separadores que colapsar", () => {
    expect(statusKeys("Hecha")).toEqual(["hecha"]);
  });

  it("sigue ignorando tildes y mayusculas, como la clave normal", () => {
    expect(statusKeys("En Revisión")[0]).toBe(
      normalizeLookupKey("en revision"),
    );
  });

  it("separa columnas que de verdad son distintas", () => {
    const hacer = statusKeys("Por hacer");
    const hecha = statusKeys("Hecha");

    expect(hacer.some((clave) => hecha.includes(clave))).toBe(false);
  });
});
