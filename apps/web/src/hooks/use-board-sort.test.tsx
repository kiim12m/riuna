import { act, renderHook, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useBoardSort } from "./use-board-sort";

describe("useBoardSort", () => {
  const storageKey = "riuna:board-sort:project-1";

  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it("restores persisted sort from storage", async () => {
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({ field: "priority", direction: "desc" }),
    );

    const { result } = renderHook(() => useBoardSort("project-1"));

    await waitFor(() => {
      expect(result.current.sort).toEqual({
        field: "priority",
        direction: "desc",
      });
    });
  });

  it("falls back to the default sort when stored JSON is invalid", async () => {
    window.localStorage.setItem(storageKey, "not-json{");

    const { result } = renderHook(() => useBoardSort("project-1"));

    await waitFor(() => {
      expect(result.current.sort).toEqual({
        field: "position",
        direction: "asc",
      });
    });
  });

  it("writes sort changes to storage", async () => {
    const { result } = renderHook(() => useBoardSort("project-1"));

    act(() => {
      result.current.setSort({ field: "dueDate", direction: "desc" });
    });

    await waitFor(() => {
      expect(window.localStorage.getItem(storageKey)).toBe(
        JSON.stringify({ field: "dueDate", direction: "desc" }),
      );
    });
  });

  // El fallo que esto vigila: con la escritura en un efecto que dependia del
  // valor, montar el hook pisaba lo guardado con el orden por defecto antes de
  // que el efecto de lectura llegase a aplicarse, y recargar deshacia la
  // eleccion. El caso de arriba no lo veia porque solo mira el valor en
  // memoria.
  //
  // Monta en StrictMode a proposito, que es como corre la aplicacion (ver
  // main.tsx): React invoca los efectos dos veces y la segunda lectura ya
  // recoge el valor pisado, que es justo lo que lo vuelve permanente. Sin
  // StrictMode el fallo no se reproduce.
  it("keeps the persisted sort after mounting, so a reload does not undo it", async () => {
    const stored = JSON.stringify({ field: "priority", direction: "desc" });
    window.localStorage.setItem(storageKey, stored);

    const { result, unmount } = renderHook(() => useBoardSort("project-1"), {
      wrapper: StrictMode,
    });

    await waitFor(() => {
      expect(result.current.sort.field).toBe("priority");
    });

    unmount();

    expect(window.localStorage.getItem(storageKey)).toBe(stored);
    expect(
      renderHook(() => useBoardSort("project-1"), { wrapper: StrictMode })
        .result.current.sort,
    ).toEqual({
      field: "priority",
      direction: "desc",
    });
  });

  it("brings the new project's sort when the id changes", async () => {
    window.localStorage.setItem(
      "riuna:board-sort:project-2",
      JSON.stringify({ field: "title", direction: "asc" }),
    );

    const { result, rerender } = renderHook(
      ({ projectId }) => useBoardSort(projectId),
      { initialProps: { projectId: "project-1" } },
    );

    expect(result.current.sort.field).toBe("position");

    rerender({ projectId: "project-2" });

    await waitFor(() => {
      expect(result.current.sort.field).toBe("title");
    });
  });

  it("falls back to the default sort when the stored field is invalid", async () => {
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({ field: "not-a-field", direction: "desc" }),
    );

    const { result } = renderHook(() => useBoardSort("project-1"));

    await waitFor(() => {
      expect(result.current.sort).toEqual({
        field: "position",
        direction: "asc",
      });
    });
  });
});
