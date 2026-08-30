import type { client } from "@riuna/libs";
import type { InferResponseType } from "hono/client";
import type Task from "@/types/task";

export type Project = Extract<
  InferResponseType<(typeof client)["project"][":id"]["$get"], 200>,
  { id: string }
>;

type TasksApiResponse = InferResponseType<
  (typeof client)["task"]["tasks"][":projectId"]["$get"],
  200
>;

type ProjectWithTasksRaw = TasksApiResponse["data"];

export type ProjectWithTasks = Omit<
  ProjectWithTasksRaw,
  "archivedTasks" | "columns" | "plannedTasks"
> & {
  archivedTasks: Task[];
  columns: Array<
    Omit<ProjectWithTasksRaw["columns"][number], "tasks"> & {
      tasks: Task[];
    }
  >;
  plannedTasks: Task[];
};

/**
 * Lo que devuelve el tablero publico, que es **menos** que el interno.
 *
 * Va aparte de `ProjectWithTasks` a proposito: esa ruta se sirve sin sesion, y
 * tiparla con la del listado interno es lo que hizo que heredara en silencio
 * los campos personalizados, las epicas y el equipo cuando las Fases 2 y 3 los
 * anadieron a `getTasks`. Si la API recorta el payload publico, esto deja de
 * compilar, que es exactamente el aviso que faltaba.
 */
type PublicProjectRaw = Extract<
  InferResponseType<(typeof client)["public-project"][":id"]["$get"], 200>,
  { id: string }
>;

export type PublicProject = PublicProjectRaw;
export type PublicTask = PublicProjectRaw["columns"][number]["tasks"][number];
