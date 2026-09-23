import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useMyTasksSearch } from "./use-search-my-work";

const mockUseQuery = vi.fn();

vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: unknown) => mockUseQuery(options),
}));

vi.mock("@/fetchers/my-work", () => ({
  searchMyWork: vi.fn(),
}));

describe("useMyTasksSearch", () => {
  it("keys the query by the whole options object, not a hand-picked subset", () => {
    const options = {
      workspaceId: "workspace-1",
      scope: "assigned" as const,
      sortBy: "smart" as const,
      sortOrder: "desc" as const,
      page: 2,
      limit: 25,
    };

    renderHook(() => useMyTasksSearch(options));

    expect(mockUseQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ["my-work", "search", options],
      }),
    );
  });

  it("keys two pages of the same search differently", () => {
    const base = { workspaceId: "workspace-1", scope: "assigned" as const };

    renderHook(() => useMyTasksSearch({ ...base, page: 1, limit: 50 }));
    renderHook(() => useMyTasksSearch({ ...base, page: 2, limit: 50 }));

    const [firstCall, secondCall] = mockUseQuery.mock.calls;
    expect(firstCall[0].queryKey).not.toEqual(secondCall[0].queryKey);
  });
});
