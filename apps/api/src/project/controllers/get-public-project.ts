import { eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { projectTable } from "../../database/schema";
import getTasks from "../../task/controllers/get-tasks";

/**
 * Lo que un tablero publico ensena de cada tarea.
 *
 * Es una lista blanca a proposito, y no la proyeccion de `getTasks`. Esta ruta
 * se sirve **sin sesion** (se registra antes del middleware de autenticacion),
 * asi que hereda todo lo que se anada al listado interno: la Fase 3 le metio
 * `custom_fields` —donde la ADR 013 pone «Presupuesto» y «Cliente»— y la Fase 2
 * las epicas, el equipo, la estimacion y la forma del arbol, sin que nadie
 * revisara quien mas llamaba a `getTasks`.
 *
 * Anadir un campo aqui es una decision; heredarlo no debe serlo.
 */
/**
 * Lo que un tablero publico ensena de cada tarea.
 *
 * Es una lista blanca a proposito, y no la proyeccion de `getTasks`. Esta ruta
 * se sirve **sin sesion** (se registra antes del middleware de autenticacion),
 * asi que heredaba todo lo que se anadiera al listado interno: la Fase 3 le
 * metio `custom_fields` —donde la ADR 013 pone «Presupuesto» y «Cliente»— y la
 * Fase 2 las epicas, el equipo, la estimacion y la forma del arbol (`path`,
 * `depth`, `parentId`), mas el `workspaceId`. Nadie reviso quien mas llamaba a
 * `getTasks`.
 *
 * Anadir un campo aqui es una decision; heredarlo no debe serlo.
 *
 * Se escogen los campos del objeto ya decorado en vez de redeclarar sus tipos,
 * para que el tipado siga viniendo de una sola fuente.
 */
function toPublicTask<
  T extends {
    id: string;
    number: number | null;
    title: string;
    description: string | null;
    status: string;
    priority: string;
    startDate: Date | null;
    dueDate: Date | null;
    createdAt: Date | null;
    assigneeName: string | null;
    assigneeImage: string | null;
    labels: unknown;
    externalLinks: unknown;
  },
>(task: T) {
  return {
    id: task.id,
    number: task.number,
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    startDate: task.startDate,
    dueDate: task.dueDate,
    createdAt: task.createdAt,
    // El nombre y el avatar de quien lleva la tarea son parte de lo que un
    // tablero publico ensena desde antes de este fork; no se retiran aqui.
    // Lo que si se queda fuera es `assigneeId`, que no pinta nada.
    assigneeName: task.assigneeName,
    assigneeImage: task.assigneeImage,
    labels: task.labels as T["labels"],
    externalLinks: task.externalLinks as T["externalLinks"],
  };
}

export async function getPublicProject(id: string) {
  const [project] = await db
    .select({ isPublic: projectTable.isPublic })
    .from(projectTable)
    .where(eq(projectTable.id, id))
    .limit(1);

  if (!project) {
    throw new HTTPException(404, {
      message: "Project not found",
    });
  }

  if (!project.isPublic) {
    throw new HTTPException(403, {
      message: "Project is not public",
    });
  }

  const result = await getTasks(id);

  if (!result.data) {
    throw new HTTPException(404, {
      message: "Project not found",
    });
  }

  if (!result.data.isPublic) {
    throw new HTTPException(403, {
      message: "Project is not public",
    });
  }

  const data = result.data;

  return {
    id: data.id,
    name: data.name,
    slug: data.slug,
    icon: data.icon,
    description: data.description,
    isPublic: data.isPublic,
    columns: data.columns.map((column) => ({
      id: column.id,
      name: column.name,
      slug: column.slug,
      icon: column.icon,
      isFinal: column.isFinal,
      tasks: column.tasks.map(toPublicTask),
    })),
    plannedTasks: data.plannedTasks.map(toPublicTask),
  };
}
