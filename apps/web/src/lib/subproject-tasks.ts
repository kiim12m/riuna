import type Task from "@/types/task";

type Subproject = {
  id: string;
  name: string;
  slug: string;
  columns: Array<{ slug: string; name: string; isFinal?: boolean }>;
  tasks: Task[];
};

type WithSubprojects = { subprojects?: Subproject[] } | null | undefined;

/**
 * Las tareas de los subproyectos que trae la vista de un padre (ADR 089),
 * cada una con la clave y el nombre de su proyecto.
 */
export function subprojectTasks(project: WithSubprojects): Task[] {
  return (project?.subprojects ?? []).flatMap((subproject) =>
    subproject.tasks.map((task) => ({
      ...task,
      projectSlug: subproject.slug,
      projectName: subproject.name,
    })),
  );
}

/** Los ids de las tareas de subproyectos que estan en una columna final. */
export function subprojectDoneIds(project: WithSubprojects): Set<string> {
  const done = new Set<string>();
  for (const subproject of project?.subprojects ?? []) {
    const finals = new Set(
      subproject.columns.filter((column) => column.isFinal).map((c) => c.slug),
    );
    for (const task of subproject.tasks) {
      if (finals.has(task.status)) done.add(task.id);
    }
  }
  return done;
}

/** Los nombres de las columnas de los subproyectos, por su slug. */
export function subprojectColumns(project: WithSubprojects) {
  return (project?.subprojects ?? []).flatMap(
    (subproject) => subproject.columns,
  );
}
