import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type Task from "@/types/task";
import TaskRow from "./task-row";

const useGetLabelsByTask = vi.fn((_taskId: string) => ({ data: [] }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock("@/hooks/queries/label/use-get-labels-by-task", () => ({
  default: (taskId: string) => useGetLabelsByTask(taskId),
}));

vi.mock("@/hooks/mutations/task/use-delete-task", () => ({
  useDeleteTask: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock("@/hooks/queries/workspace/use-active-workspace", () => ({
  default: () => ({ data: { id: "workspace-1" } }),
}));

vi.mock(
  "@/hooks/queries/workspace-users/use-get-active-workspace-users",
  () => ({
    useGetActiveWorkspaceUsers: () => ({ data: { members: [] } }),
  }),
);

vi.mock(
  "../kanban-board/task-card-context-menu/task-card-context-menu-content",
  () => ({ default: () => null }),
);

vi.mock("@/store/bulk-selection", () => ({
  default: () => ({
    toggleSelection: vi.fn(),
    isSelected: () => false,
    isFocused: () => false,
  }),
}));

vi.mock("@/store/project", () => ({
  default: () => ({ project: { id: "project-1", slug: "kan" } }),
}));

vi.mock("@/store/user-preferences", () => ({
  useUserPreferencesStore: () => ({
    showAssignees: true,
    showDueDates: true,
    showLabels: true,
    showTaskNumbers: true,
  }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
  initReactI18next: { type: "3rdParty", init: vi.fn() },
}));

const task: Task = {
  id: "task-1",
  title: "Row from payload",
  number: 7,
  description: null,
  status: "to-do",
  priority: null,
  startDate: null,
  dueDate: null,
  position: 1,
  createdAt: "2026-08-05T00:00:00.000Z",
  userId: null,
  assigneeId: null,
  assigneeName: null,
  projectId: "project-1",
  labels: [{ id: "label-1", name: "Bug", color: "red" }],
};

describe("TaskRow", () => {
  it("renders labels from the task payload without per-row requests", () => {
    render(<TaskRow task={task} projectSlug="kan" />);

    expect(screen.getByText("Bug")).toBeVisible();
    expect(useGetLabelsByTask).not.toHaveBeenCalled();
  });
});
