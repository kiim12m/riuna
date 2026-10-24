import type { QueryClient } from "@tanstack/react-query";
import type { TaskPlacement } from "@/fetchers/task/reorder-task";
import type { ProjectWithTasks } from "@/types/project";
import type Task from "@/types/task";

/**
 * Mueve una tarea dentro del listado de un proyecto igual que la API
 * (`reorder-task.ts`): la saca de donde este, le pone el estado y la deja
 * detras de `afterId`, delante de `beforeId` o al final. Si la tarea no esta
 * en el listado —otro proyecto, u oculta por un filtro—, lo devuelve tal cual.
 */
export function placeTaskInProject(
  project: ProjectWithTasks,
  taskId: string,
  placement: TaskPlacement,
): ProjectWithTasks {
  const task = [
    ...project.columns.flatMap((column) => column.tasks),
    ...project.plannedTasks,
    ...project.archivedTasks,
  ].find((candidate) => candidate.id === taskId);
  if (!task) return project;

  const moved = { ...task, status: placement.status };
  const place = (tasks: Task[], isTarget: boolean) => {
    const rest = tasks.filter((candidate) => candidate.id !== taskId);
    if (!isTarget) return rest.length === tasks.length ? tasks : rest;
    const after = rest.findIndex(
      (candidate) => candidate.id === placement.afterId,
    );
    const before = rest.findIndex(
      (candidate) => candidate.id === placement.beforeId,
    );
    const index = after >= 0 ? after + 1 : before >= 0 ? before : rest.length;
    return [...rest.slice(0, index), moved, ...rest.slice(index)];
  };

  return {
    ...project,
    columns: project.columns.map((column) => {
      const tasks = place(column.tasks, column.slug === placement.status);
      return tasks === column.tasks ? column : { ...column, tasks };
    }),
    plannedTasks: place(project.plannedTasks, placement.status === "planned"),
    archivedTasks: place(
      project.archivedTasks,
      placement.status === "archived",
    ),
  };
}

export function placeTaskInTasksCache(
  queryClient: QueryClient,
  taskId: string,
  placement: TaskPlacement,
) {
  queryClient.setQueriesData<ProjectWithTasks | undefined>(
    { queryKey: ["tasks"] },
    (existingProject) =>
      existingProject
        ? placeTaskInProject(existingProject, taskId, placement)
        : existingProject,
  );
}
