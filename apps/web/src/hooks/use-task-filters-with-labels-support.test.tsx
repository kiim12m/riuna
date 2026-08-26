import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useTaskFiltersWithLabelsSupport } from "./use-task-filters-with-labels-support";

describe("useTaskFiltersWithLabelsSupport", () => {
  const storageKey = "riuna:board-filters:project-1";

  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it("restores persisted label filters from storage and matches tasks from project data", async () => {
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({ labels: ["label-bug"] }),
    );

    const project = {
      id: "project-1",
      name: "Project",
      slug: "PROJ",
      icon: null,
      description: null,
      isPublic: false,
      createdAt: "2026-04-16T00:00:00.000Z",
      updatedAt: "2026-04-16T00:00:00.000Z",
      workspaceId: "workspace-1",
      columns: [
        {
          id: "todo",
          slug: "todo",
          name: "Todo",
          icon: null,
          isFinal: false,
          tasks: [
            {
              id: "task-1",
              title: "Bug task",
              number: 1,
              description: null,
              status: "todo",
              priority: null,
              startDate: null,
              dueDate: null,
              position: 0,
              createdAt: "2026-04-16T00:00:00.000Z",
              updatedAt: "2026-04-16T00:00:00.000Z",
              userId: null,
              assigneeId: null,
              assigneeName: null,
              assigneeImage: null,
              projectId: "project-1",
              labels: [
                {
                  id: "label-bug",
                  name: "bug",
                  color: "red",
                },
              ],
              externalLinks: [],
            },
            {
              id: "task-2",
              title: "Other task",
              number: 2,
              description: null,
              status: "todo",
              priority: null,
              startDate: null,
              dueDate: null,
              position: 1,
              createdAt: "2026-04-16T00:00:00.000Z",
              updatedAt: "2026-04-16T00:00:00.000Z",
              userId: null,
              assigneeId: null,
              assigneeName: null,
              assigneeImage: null,
              projectId: "project-1",
              labels: [],
              externalLinks: [],
            },
          ],
        },
      ],
      plannedTasks: [],
      archivedTasks: [],
    };

    const { result } = renderHook(() =>
      useTaskFiltersWithLabelsSupport(project, "project-1"),
    );

    await waitFor(() => {
      expect(result.current.filters.labels).toEqual(["label-bug"]);
    });

    expect(result.current.filteredProject?.columns[0]?.tasks).toHaveLength(1);
    expect(result.current.filteredProject?.columns[0]?.tasks[0]?.id).toBe(
      "task-1",
    );
  });

  it("keeps only the tasks of the selected teams and forgets tasks with no team", async () => {
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({ team: ["team-design"] }),
    );

    const tareaBase = {
      number: null,
      description: null,
      status: "todo",
      priority: null,
      startDate: null,
      dueDate: null,
      createdAt: "2026-04-16T00:00:00.000Z",
      updatedAt: "2026-04-16T00:00:00.000Z",
      userId: null,
      assigneeId: null,
      assigneeName: null,
      assigneeImage: null,
      projectId: "project-1",
      labels: [],
      externalLinks: [],
    };

    const project = {
      id: "project-1",
      name: "Project",
      slug: "PROJ",
      icon: null,
      description: null,
      isPublic: false,
      createdAt: "2026-04-16T00:00:00.000Z",
      updatedAt: "2026-04-16T00:00:00.000Z",
      workspaceId: "workspace-1",
      columns: [
        {
          id: "todo",
          slug: "todo",
          name: "Todo",
          icon: null,
          isFinal: false,
          tasks: [
            {
              ...tareaBase,
              id: "task-design",
              title: "Design task",
              position: 0,
              teamId: "team-design",
            },
            {
              ...tareaBase,
              id: "task-backend",
              title: "Backend task",
              position: 1,
              teamId: "team-backend",
            },
            {
              ...tareaBase,
              id: "task-sin-equipo",
              title: "Task with no team",
              position: 2,
              teamId: null,
            },
          ],
        },
      ],
      plannedTasks: [],
      archivedTasks: [],
    };

    const { result } = renderHook(() =>
      useTaskFiltersWithLabelsSupport(project, "project-1"),
    );

    await waitFor(() => {
      expect(result.current.filters.team).toEqual(["team-design"]);
    });

    expect(result.current.filteredProject?.columns[0]?.tasks).toEqual([
      expect.objectContaining({ id: "task-design" }),
    ]);
    expect(result.current.hasActiveFilters).toBe(true);
  });

  it.each(["#123", "proj-123", "proj-"])(
    "matches a task by its issue identifier when searching for %s",
    (textQuery) => {
      const project = {
        id: "project-1",
        name: "Project",
        slug: "PROJ",
        icon: null,
        description: null,
        isPublic: false,
        createdAt: "2026-04-16T00:00:00.000Z",
        updatedAt: "2026-04-16T00:00:00.000Z",
        workspaceId: "workspace-1",
        columns: [
          {
            id: "todo",
            slug: "todo",
            name: "Todo",
            icon: null,
            isFinal: false,
            tasks: [
              {
                id: "task-123",
                title: "Unrelated title",
                number: 123,
                description: null,
                status: "todo",
                priority: null,
                startDate: null,
                dueDate: null,
                position: 0,
                createdAt: "2026-04-16T00:00:00.000Z",
                updatedAt: "2026-04-16T00:00:00.000Z",
                userId: null,
                assigneeId: null,
                assigneeName: null,
                assigneeImage: null,
                projectId: "project-1",
                labels: [],
                externalLinks: [],
              },
              {
                id: "task-without-number",
                title: "Another unrelated title",
                number: null,
                description: null,
                status: "todo",
                priority: null,
                startDate: null,
                dueDate: null,
                position: 1,
                createdAt: "2026-04-16T00:00:00.000Z",
                updatedAt: "2026-04-16T00:00:00.000Z",
                userId: null,
                assigneeId: null,
                assigneeName: null,
                assigneeImage: null,
                projectId: "project-1",
                labels: [],
                externalLinks: [],
              },
            ],
          },
        ],
        plannedTasks: [],
        archivedTasks: [],
      };

      const { result } = renderHook(() =>
        useTaskFiltersWithLabelsSupport(project, "project-1", textQuery),
      );

      expect(result.current.filteredProject?.columns[0]?.tasks).toEqual([
        expect.objectContaining({ id: "task-123" }),
      ]);
    },
  );
});
