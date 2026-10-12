import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import TaskTitle from "./task-title";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
  initReactI18next: { type: "3rdParty", init: () => {} },
}));
vi.mock("@/hooks/queries/task/use-get-task", () => ({
  default: () => ({
    data: { id: "task-1", projectId: "project-1", title: "Revisar" },
  }),
}));
vi.mock("@/hooks/mutations/task/use-update-task-title", () => ({
  useUpdateTaskTitle: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("@/hooks/use-workspace-permission", () => ({
  useWorkspacePermission: () => ({ canUpdateTasks: () => true }),
}));

afterEach(cleanup);

function focusedTitle() {
  render(<TaskTitle taskId="task-1" />);
  const title = screen.getByRole("textbox");
  title.focus();
  return title;
}

// Revision de la Fase 9, hallazgo 11.
describe("TaskTitle", () => {
  it("finishes editing on Enter", () => {
    const title = focusedTitle();

    fireEvent.keyDown(title, { key: "Enter" });

    expect(document.activeElement).not.toBe(title);
  });

  it("does not finish while an input method is composing a word", () => {
    const title = focusedTitle();

    fireEvent.keyDown(title, { key: "Enter", isComposing: true });
    fireEvent.keyDown(title, { key: "Enter", keyCode: 229 });

    expect(document.activeElement).toBe(title);
  });
});
