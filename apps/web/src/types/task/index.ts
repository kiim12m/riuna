type TaskLabel = {
  id: string;
  name: string;
  color: string;
};

type TaskExternalLink = {
  id: string;
  taskId: string;
  integrationId: string;
  resourceType: string;
  externalId: string;
  url: string;
  title: string | null;
  metadata: Record<string, unknown> | null;
};

export type TaskEpic = {
  id: string;
  name: string;
  color: string | null;
};

// Lo que un padre resume de su rama. Solo viene relleno en las tareas que
// tienen al menos una hija; en una hoja es `null`.
export type TaskSubtree = {
  childCount: number;
  descendantCount: number;
  descendantDoneCount: number;
  progress: number;
  startDate: string | null;
  dueDate: string | null;
  inheritsStartDate: boolean;
  inheritsDueDate: boolean;
  estimateSeconds: number;
  loggedSeconds: number;
};

type Task = {
  id: string;
  title: string;
  number: number | null;
  description: string | null;
  status: string;
  priority: string | null;
  startDate: string | null;
  dueDate: string | null;
  position: number | null;
  createdAt: string;
  updatedAt?: string;
  userId: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  assigneeImage?: string | null;
  // Conjunto completo de asignados, en orden de asignacion e incluyendo al
  // responsable principal. Opcional porque solo lo devuelve el detalle.
  assignees?: { id: string; name: string; image: string | null }[];
  // Departamento responsable, independiente del asignado individual.
  // Opcional a proposito: es un campo aditivo y hacerlo obligatorio romperia
  // todos los sitios que ya construyen tareas sin el.
  teamId?: string | null;
  teamName?: string | null;
  projectId: string;
  columnId?: string | null;
  labels?: TaskLabel[];
  externalLinks?: TaskExternalLink[];
  // El arbol. `parentId` manda; `path` y `depth` son su forma materializada y
  // llegan del servidor ya calculados, para poder ordenar y sangrar sin
  // reconstruir la jerarquia en el cliente.
  parentId?: string | null;
  path?: string;
  depth?: number;
  // Estimacion en segundos, la misma unidad que el tiempo registrado.
  estimate?: number | null;
  epics?: TaskEpic[];
  // Los valores de los campos personalizados, indexados por la `key` de su
  // definicion. Siempre viene, aunque sea vacio: la columna es NOT NULL.
  customFields?: Record<string, unknown>;
  subtree?: TaskSubtree | null;
  // Solo en el detalle: la tarea de la que cuelga esta.
  parent?: {
    id: string;
    title: string;
    number: number | null;
    status: string;
  } | null;
};

export default Task;
