import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useBoardFilters } from "./use-board-filters";

describe("useBoardFilters", () => {
  const storageKey = "riuna:board-filters:project-1";
  const workspaceLabels = [
    { id: "label-bug", name: "Bug" },
    { id: "label-bug-2", name: "Bug" },
  ];

  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
    vi.useRealTimers();
  });

  it("has no filter to send until a menu is touched", () => {
    const { result } = renderHook(() =>
      useBoardFilters({ projectId: "project-1", workspaceLabels }),
    );

    expect(result.current.filter).toBeNull();
    expect(result.current.hasActiveFilters).toBe(false);
  });

  it("restores the persisted menus and turns labels into names for the server", async () => {
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({ labels: ["label-bug", "label-bug-2"] }),
    );

    const { result } = renderHook(() =>
      useBoardFilters({ projectId: "project-1", workspaceLabels }),
    );

    await vi.waitFor(() =>
      expect(result.current.filter).toEqual({
        type: "condition",
        field: "label",
        operator: "in",
        value: ["Bug"],
      }),
    );
    expect(result.current.hasActiveFilters).toBe(true);
  });

  it("persists what the person picks and clears it", async () => {
    const { result } = renderHook(() =>
      useBoardFilters({ projectId: "project-1", workspaceLabels }),
    );

    act(() => result.current.updateFilter("priority", ["high"]));
    await vi.waitFor(() =>
      expect(
        JSON.parse(window.localStorage.getItem(storageKey) ?? "{}"),
      ).toMatchObject({
        priority: ["high"],
      }),
    );

    act(() => result.current.clearFilters());
    expect(result.current.filter).toBeNull();
  });

  it("waits for a pause in typing before the text reaches the filter", () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(
      ({ text }) =>
        useBoardFilters({
          projectId: "project-1",
          projectSlug: "PROJ",
          textQuery: text,
        }),
      { initialProps: { text: "" } },
    );

    rerender({ text: "zanja" });
    expect(result.current.filter).toBeNull();

    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(result.current.filter).toMatchObject({ type: "or" });
  });
});
