import { act, renderHook } from "@testing-library/react";
import { StrictMode } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { useTaskGrouping } from "./use-task-grouping";

const KEY = "riuna:task-group:project-1";

describe("useTaskGrouping", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("starts grouped by status when nothing was stored", () => {
    const { result } = renderHook(() => useTaskGrouping("project-1"));

    expect(result.current.groupBy).toBe("status");
  });

  it("remembers the choice", () => {
    const { result } = renderHook(() => useTaskGrouping("project-1"));

    act(() => result.current.setGroupBy("team"));

    expect(result.current.groupBy).toBe("team");
    expect(window.localStorage.getItem(KEY)).toBe("team");
  });

  // El fallo que esto vigila: con la escritura en un efecto que dependia del
  // valor, el primer render la disparaba con el inicial y pisaba lo guardado,
  // asi que recargar la pagina deshacia la eleccion.
  //
  // Monta en StrictMode a proposito, que es como corre la aplicacion (ver
  // main.tsx): React invoca los efectos dos veces y la segunda lectura ya
  // recoge el valor pisado, que es justo lo que lo vuelve permanente. Sin
  // StrictMode el fallo no se reproduce.
  it("comes back grouped by team after a remount", () => {
    window.localStorage.setItem(KEY, "team");

    const { result, unmount } = renderHook(() => useTaskGrouping("project-1"), {
      wrapper: StrictMode,
    });

    expect(result.current.groupBy).toBe("team");
    unmount();

    expect(window.localStorage.getItem(KEY)).toBe("team");
    expect(
      renderHook(() => useTaskGrouping("project-1"), { wrapper: StrictMode })
        .result.current.groupBy,
    ).toBe("team");
  });

  it("ignores a stored value that is not a grouping", () => {
    window.localStorage.setItem(KEY, "por-color");

    const { result } = renderHook(() => useTaskGrouping("project-1"));

    expect(result.current.groupBy).toBe("status");
  });

  it("keeps each project's choice apart", () => {
    const first = renderHook(() => useTaskGrouping("project-1"));
    act(() => first.result.current.setGroupBy("team"));

    const second = renderHook(() => useTaskGrouping("project-2"));

    expect(second.result.current.groupBy).toBe("status");
    expect(first.result.current.groupBy).toBe("team");
  });

  it("brings the new project's choice when the id changes", () => {
    window.localStorage.setItem("riuna:task-group:project-2", "team");

    const { result, rerender } = renderHook(
      ({ projectId }) => useTaskGrouping(projectId),
      { initialProps: { projectId: "project-1" } },
    );

    expect(result.current.groupBy).toBe("status");

    rerender({ projectId: "project-2" });

    expect(result.current.groupBy).toBe("team");
  });

  it("does nothing without a project", () => {
    const { result } = renderHook(() => useTaskGrouping(undefined));

    act(() => result.current.setGroupBy("team"));

    expect(result.current.groupBy).toBe("team");
    expect(window.localStorage.length).toBe(0);
  });
});
