import { describe, expect, it } from "vitest";
import {
  DEFAULT_WIDGET_SIZE,
  WIDGET_TYPES,
} from "../../../apps/api/src/dashboard/widget-config";
// La copia del web, importada a proposito: el editor envia siempre ancho y
// alto —tiene que enseñarlos en sus selectores—, asi que el defecto del
// servidor no llega a aplicarse a un widget creado desde la interfaz y la
// tabla vive dos veces. Comparar las dos es lo unico que impide que diverjan,
// y es el mismo trato que reciben las dos copias de `buildFilter`.
import { SIZE_BY_TYPE } from "../../../apps/web/src/components/dashboard/widget-size";

describe("el tamaño de partida de un widget", () => {
  it("dice lo mismo en la API y en el editor, tipo a tipo", () => {
    expect(SIZE_BY_TYPE).toEqual(DEFAULT_WIDGET_SIZE);
  });

  it("cubre todos los tipos que existen", () => {
    for (const type of WIDGET_TYPES) {
      expect(DEFAULT_WIDGET_SIZE[type]).toBeDefined();
      expect(SIZE_BY_TYPE[type]).toBeDefined();
    }

    // Y ninguno de mas: un tipo retirado de `WIDGET_TYPES` que siguiera aqui
    // seria una fila muerta que nadie volveria a mirar.
    expect(Object.keys(SIZE_BY_TYPE).sort()).toEqual([...WIDGET_TYPES].sort());
  });

  it("cabe en la rejilla que declara el esquema", () => {
    for (const type of WIDGET_TYPES) {
      const size = DEFAULT_WIDGET_SIZE[type];
      // Los mismos limites que los CHECK de `dashboard_widget`: un defecto
      // fuera de rango seria un 500 al crear, no un widget feo.
      expect(size.span).toBeGreaterThanOrEqual(1);
      expect(size.span).toBeLessThanOrEqual(12);
      expect(size.rowSpan).toBeGreaterThanOrEqual(1);
      expect(size.rowSpan).toBeLessThanOrEqual(6);
    }
  });
});
