import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  useEditableUntilKnown,
  useWorkspacePermission,
} from "./use-workspace-permission";

const { hasPermission } = vi.hoisted(() => ({
  hasPermission: vi.fn(),
}));

vi.mock("@/hooks/queries/workspace/use-active-workspace", () => ({
  default: () => ({ data: { id: "workspace-1" } }),
}));

vi.mock("@/hooks/queries/workspace-users/use-active-workspace-user", () => ({
  useGetActiveWorkspaceUser: () => ({ data: { role: "member" } }),
}));

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    organization: { hasPermission },
  },
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

describe("useWorkspacePermission", () => {
  beforeEach(() => {
    hasPermission.mockReset();
  });

  it("keeps update capabilities independent from delete capabilities", async () => {
    const granted = {
      task: new Set(["create", "read", "update"]),
      label: new Set(["create", "read", "update"]),
    } as Record<string, Set<string>>;

    hasPermission.mockImplementation(
      async ({ permissions }: { permissions: Record<string, string[]> }) => ({
        data: {
          success: Object.entries(permissions).every(([resource, actions]) =>
            actions.every((action) => granted[resource]?.has(action)),
          ),
        },
      }),
    );

    const { result } = renderHook(() => useWorkspacePermission(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isCheckingPermissions).toBe(false);
    });

    expect(result.current.canCreateTasks()).toBe(true);
    expect(result.current.canUpdateTasks()).toBe(true);
    expect(result.current.canDeleteTasks()).toBe(false);
    expect(result.current.canCreateLabels()).toBe(true);
    expect(result.current.canUpdateLabels()).toBe(true);
    expect(result.current.canDeleteLabels()).toBe(false);
  });

  // Revision de la Fase 9, hallazgo 12.
  it("lets an editing control open until the permissions arrive, then follows them", async () => {
    let answer: (value: { data: { success: boolean } }) => void = () => {};
    const pending = new Promise<{ data: { success: boolean } }>((resolve) => {
      answer = resolve;
    });
    hasPermission.mockImplementation(() => pending);

    const { result } = renderHook(() => useEditableUntilKnown("updateTasks"), {
      wrapper: createWrapper(),
    });

    expect(result.current).toBe(true);

    answer({ data: { success: false } });

    await waitFor(() => {
      expect(result.current).toBe(false);
    });
  });
});
