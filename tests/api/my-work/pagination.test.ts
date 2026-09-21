import { describe, expect, it } from "vitest";
import {
  DEFAULT_PAGE_SIZE,
  emptyPage,
  MAX_PAGE_SIZE,
  resolvePaging,
} from "../../../apps/api/src/my-work/pagination";

describe("resolvePaging", () => {
  it("falls back to the first page and the default size", () => {
    expect(resolvePaging()).toEqual({
      page: 1,
      pageSize: DEFAULT_PAGE_SIZE,
      offset: 0,
    });
  });

  it("computes the offset from the page and the size", () => {
    expect(resolvePaging(3, 20)).toEqual({ page: 3, pageSize: 20, offset: 40 });
  });

  // El validador ya acota `limit` a 100, pero el controlador tambien se llama
  // desde dentro: sin este tope, una llamada directa podria pedir una pagina
  // de cincuenta mil filas.
  it("caps the page size", () => {
    expect(resolvePaging(1, 5_000).pageSize).toBe(MAX_PAGE_SIZE);
  });

  it("treats a zero or negative page as the first one", () => {
    expect(resolvePaging(0).page).toBe(1);
    expect(resolvePaging(-4).page).toBe(1);
    expect(resolvePaging(1, 0).pageSize).toBe(DEFAULT_PAGE_SIZE);
  });

  it("reports nothing to count, not an end-of-list page", () => {
    expect(emptyPage(2, 25)).toEqual({
      tasks: [],
      pagination: {
        page: 2,
        pageSize: 25,
        hasMore: false,
        total: 0,
        totalIsCapped: false,
      },
    });
  });
});
