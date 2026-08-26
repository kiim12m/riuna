import type Task from "@/types/task";

export const GROUP_BY_FIELDS = ["status", "team"] as const;

export type GroupByField = (typeof GROUP_BY_FIELDS)[number];

export type TaskGroup = {
  id: string;
  name: string;
  tasks: Task[];
};

// Las tareas sin equipo no pueden compartir clave con un equipo real, y el id
// de un equipo es un cuid: ningun equipo puede llamarse asi.
export const NO_TEAM_GROUP_ID = "__no-team__";

export function isGroupByField(value: unknown): value is GroupByField {
  return GROUP_BY_FIELDS.includes(value as GroupByField);
}

/**
 * Agrupa por el equipo que ya viaja en cada tarea (`teamId` + `teamName`), sin
 * consultar la lista de equipos del espacio: asi la agrupacion no puede
 * discrepar de lo que la vista esta enseñando.
 *
 * Solo salen los grupos con tareas. Enseñar los equipos vacios del espacio
 * llenaria la lista de cabeceras que no llevan a ningun sitio.
 */
export function groupTasksByTeam(
  tasks: Task[],
  noTeamName: string,
): TaskGroup[] {
  const groups = new Map<string, TaskGroup>();

  for (const task of tasks) {
    const id = task.teamId || NO_TEAM_GROUP_ID;
    const name = task.teamId ? task.teamName || task.teamId : noTeamName;

    const group = groups.get(id);
    if (group) {
      group.tasks.push(task);
      continue;
    }

    groups.set(id, { id, name, tasks: [task] });
  }

  const named = [...groups.values()]
    .filter((group) => group.id !== NO_TEAM_GROUP_ID)
    .sort((a, b) => a.name.localeCompare(b.name));

  // «Sin equipo» va al final: es un cajon de pendientes de repartir, no un
  // departamento mas.
  const withoutTeam = groups.get(NO_TEAM_GROUP_ID);

  return withoutTeam ? [...named, withoutTeam] : named;
}
